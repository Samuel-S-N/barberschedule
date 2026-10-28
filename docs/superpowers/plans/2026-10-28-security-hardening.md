# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the findings M1, M2, B2, B3, B4, B5 and B6 from the 2026-10-27 security audit (B1 is out of scope by decision).

**Architecture:** One migration (`0064`) carries every database change: CHECK constraints for text sizes, a trigger that stops direct table writes from linking accounts, and stricter `register_notification_token` / `update_my_barber_profile`. The edge function `dispatch-notifications` gets a pure, unit-tested auth guard. Auth config and Zod schemas mirror the new limits so the app shows its own messages before the database refuses.

**Tech Stack:** Supabase Postgres 17 + pgTAP (`npm run test:db`), Deno edge functions, Expo/React Native, Zod, Jest.

**Spec:** the audit findings below (no separate spec file: each finding is a bounded fix).

| ID | Finding | Fix |
|---|---|---|
| M1 | No length limit on user text (1 MB note accepted) | CHECK constraints + Zod `max` |
| M2 | Server accepts 6-char passwords (app asks 8) | `minimum_password_length = 8`; hosted doc |
| B2 | Owner can link any account to a barber/customer row | Trigger `guard_account_link` |
| B3 | Push token accepts any string | Format + platform validation in the RPC |
| B4 | `dispatch-notifications` has no caller check | Require the service-role bearer |
| B5 | Barber avatar accepts any http(s) URL | Must be the caller's own `avatars/<uid>/avatar-N.ext` |
| B6 | `npm audit` high/critical in tooling | `npm audit fix` (non-breaking only) |

## Global Constraints

- Branch `fix-security-hardening` from `origin/main`. Migration number **0064** and pgTAP file **046** (0061-0063 and 043-045 are taken by the open payout PRs).
- Limits (DB and Zod identical): names 100 (`customers.full_name`, `profiles.full_name`), 80 (`barbers.name`, `services.name`); `customers.email` 254; `customers.phone` 30; `appointments.notes` 500; `services.description` 500; `barbers.avatar_url` 500; push token 200; platform one of `ios`, `android`, `web`.
- Error codes: existing `P0016 NOTIFICATION_TOKEN_INVALID`, `P0017 PROFILE_INVALID`; new `42501 ACCOUNT_LINK_FORBIDDEN`.
- Security definer RPCs and the service role must keep linking accounts (`ensure_my_customer`, `barber_find_or_create_customer`, `invite-barber`); only direct writes by the `authenticated` role are limited.

---

### Task 1: Text length limits (M1)

**Files:**
- Create: `supabase/migrations/0064_security_hardening.sql`
- Create: `supabase/tests/046_security_hardening.sql`
- Modify: `src/features/auth/validation.ts`, `src/features/customers/validation.ts`, `src/features/barbers/validation.ts`, `src/features/services/validation.ts`
- Test: matching `tests/unit|integration/*validation*` files

- [ ] **Step 1: pgTAP failing tests** — as postgres inside the test transaction, `throws_ok` for each oversize write (`23514`): appointment notes 501, customer full_name 101 / email 255 / phone 31, profile full_name 101, barber name 81, service name 81 / description 501; `lives_ok` at the exact limit.
- [ ] **Step 2: Run** `npx supabase test db supabase/tests/046_security_hardening.sql` → FAIL (no constraint).
- [ ] **Step 3: Migration**

```sql
alter table public.appointments add constraint appointments_notes_length check (notes is null or char_length(notes) <= 500);
alter table public.customers
  add constraint customers_full_name_length check (char_length(full_name) <= 100),
  add constraint customers_email_length check (email is null or char_length(email) <= 254),
  add constraint customers_phone_length check (phone is null or char_length(phone) <= 30);
alter table public.profiles add constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 100);
alter table public.barbers
  add constraint barbers_name_length check (char_length(name) <= 80),
  add constraint barbers_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 500);
alter table public.services
  add constraint services_name_length check (char_length(name) <= 80),
  add constraint services_description_length check (description is null or char_length(description) <= 500);
```

- [ ] **Step 4: Zod** — add `.max(N, <message in the file's style>)` to signup `fullName` (100), customer `fullName`/`email`/`phone` (100/254/30), barber `name` (80), service `name`/`description` (80/500). Failing Jest case first for each schema, then the change.
- [ ] **Step 5: Run** pgTAP file + `npx jest tests/unit tests/integration -t validation` → PASS. Commit `fix(db): cap user text sizes`.

### Task 2: Account links only through RPCs (B2)

**Files:** migration 0064 (append), pgTAP 046 (append)

- [ ] **Step 1: pgTAP failing tests** — as owner (`set local role authenticated` + jwt claims): insert barber with own uid → lives; with another uid → `throws_ok '42501'`; update name of a barber linked to another user → lives; update `user_id` to another uid → throws; set `user_id` null → lives; customers insert with `user_id` → throws; update customer `user_id` → throws. As the barber, `barber_find_or_create_customer` with a confirmed customer email still links (`has_account = true`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Migration**

```sql
create function public.guard_account_link() returns trigger
language plpgsql set search_path = pg_catalog, public, pg_temp as $$
begin
  -- Only direct table writes from the app are limited: security definer RPCs run as their owner, invites as the service role.
  if current_user = 'authenticated'
    and new.user_id is not null
    and new.user_id is distinct from (case when tg_op = 'UPDATE' then old.user_id end)
    and (tg_table_name = 'customers' or new.user_id <> auth.uid())
  then
    raise exception using errcode = '42501', message = 'ACCOUNT_LINK_FORBIDDEN';
  end if;
  return new;
end;
$$;
create trigger barbers_guard_account_link before insert or update of user_id on public.barbers
  for each row execute function public.guard_account_link();
create trigger customers_guard_account_link before insert or update of user_id on public.customers
  for each row execute function public.guard_account_link();
```

- [ ] **Step 4: Run** → PASS. Commit `fix(db): only RPCs link accounts to barber and customer rows`.

### Task 3: Push token and barber avatar validation (B3, B5)

**Files:** migration 0064 (append), pgTAP 046 (append), `supabase/tests/013_barber_role.sql:173` (valid own-path URL)

- [ ] **Step 1: pgTAP failing tests** — `register_notification_token(repeat('x',100))` and `('ExponentPushToken[' || repeat('a',200) || ']')` → `throws_ok 'P0016'`; platform `'evil'` stored as null; `'ExponentPushToken[abc-_1]'` lives. Barber: `update_my_barber_profile('b', 'http://evil.example/t.gif')` → `P0017`; another user's folder → `P0017`; `http://127.0.0.1:55421/storage/v1/object/public/avatars/<own uid>/avatar-1.jpg` → lives.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Migration** — `create or replace` both functions from their current definitions, adding:

```sql
-- register_notification_token
if target_expo_push_token is null or btrim(target_expo_push_token) !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,180}\]$' then
  raise exception using errcode = 'P0016', message = 'NOTIFICATION_TOKEN_INVALID';
end if;
-- platform: case when target_platform in ('ios', 'android', 'web') then target_platform end

-- update_my_barber_profile
if clean_avatar is not null and clean_avatar !~ (
  '^https?://[^/[:space:]?#]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/avatar-[0-9]+\.(jpg|png|webp)$'
) then
  raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
end if;
```

- [ ] **Step 4: Run** pgTAP 046, 009, 012, 013 → PASS. Commit `fix(db): validate push tokens and keep barber avatars in their own folder`.

### Task 4: Dispatcher caller check (B4)

**Files:**
- Create: `supabase/functions/dispatch-notifications/auth.ts`
- Modify: `supabase/functions/dispatch-notifications/index.ts`, `docs/hosted-deploy.md` (§5)
- Test: `tests/unit/dispatch-auth.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { isServiceRequest } from "../../supabase/functions/dispatch-notifications/auth";

describe("isServiceRequest", () => {
  it("accepts the service-role bearer", () => expect(isServiceRequest("Bearer s3cret", "s3cret")).toBe(true));
  it("rejects a missing header", () => expect(isServiceRequest(null, "s3cret")).toBe(false));
  it("rejects another key", () => expect(isServiceRequest("Bearer anon-key", "s3cret")).toBe(false));
  it("rejects a prefix of the key", () => expect(isServiceRequest("Bearer s3cre", "s3cret")).toBe(false));
});
```

- [ ] **Step 2: Run** `npx jest tests/unit/dispatch-auth.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement**

```ts
// Constant-time comparison: only the scheduler, holding the service-role key, may drain the outbox.
export function isServiceRequest(authorization: string | null, serviceKey: string) {
  const expected = `Bearer ${serviceKey}`;
  if (!authorization || authorization.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= authorization.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
```

In `dispatch()`, after the method check: `if (!isServiceRequest(request.headers.get("Authorization"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))) return new Response("Unauthorized", { status: 401 });`. Doc §5: the scheduler calls the function with `Authorization: Bearer <service role key>`.

- [ ] **Step 4: Run** → PASS. Commit `fix(functions): dispatch-notifications only answers the service role`.

### Task 5: Password minimum (M2)

**Files:** `supabase/config.toml` (`[auth]`), `docs/hosted-deploy.md` (auth settings step)

- [ ] **Step 1: Failing check** — `curl -s -X POST $URL/auth/v1/signup -H "apikey: $ANON" -d '{"email":"pw7@example.test","password":"1234567"}'` returns a session (accepted).
- [ ] **Step 2:** `[auth] minimum_password_length = 8`; doc: set the same minimum in the hosted Auth settings.
- [ ] **Step 3:** restart the local stack (`npx supabase stop && npx supabase start`), repeat the curl → `weak_password`; delete the probe user if any was created in Step 1. Commit `fix(auth): server enforces the 8-character password minimum`.

### Task 6: Dependencies (B6)

- [ ] `npm audit fix` (never `--force`), then `npx tsc --noEmit`, `npm run lint`, `npx jest`. Keep only if all pass; record what remains. Commit `chore(deps): npm audit fix`.

### Task 7: Verification and PR

- [ ] `npm run test:db` (full), `npx jest`, `npx tsc --noEmit`, `npm run lint`.
- [ ] Re-run the audit probes (`probe.sql`, `probe2.sql`) on the dev DB: every M1/B2/B3/B5 vector now refused.
- [ ] Code review (requesting-code-review), push, PR, bind + Auto-fix.
