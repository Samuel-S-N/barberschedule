# Customer Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the complete customer experience — signup, login, tab navigation, home, booking, agenda with calendar (reschedule/cancel), profile — plus LGPD consent, data export and account deletion.

**Architecture:** One additive migration (`0023`) supplies the missing self-service RPCs; a thin `src/features/account` client wraps them. Customer routes live under `app/(customer)` with a custom `Tabs` bar; booking screens move there from `(public)`. All screen logic that can be tested without a renderer is extracted into pure modules (Jest); screens are verified by Playwright with mocked Supabase REST, as in earlier cycles.

**Tech Stack:** Expo Router 57, React Native 0.86 / RN Web, NativeWind 4, TanStack Query 5, Supabase (Postgres RPC, Edge Function), Zod 4, Jest (jest-expo, RNTL 14 — `render`/`fireEvent` are awaited), pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-23-customer-frontend-design.md`

## Spec deltas decided while planning (Task 12 amends the spec)

- `ensure_my_customer()` takes **no parameters**: it reads phone and `accepted_terms_version` from the caller's own `auth.users.raw_user_meta_data` (set at signup), so email-confirmation flows work across devices.
- Consents are written **only** by `ensure_my_customer()` (no direct insert grant, no separate RPC) — stricter than the spec's "insert own rows" RLS.
- `legal` lives at root `app/legal.tsx` (reachable signed-out from signup and signed-in from profile), not under `(customer)`.
- Tab labels: Home / Book / Agenda / Profile (English, matching the shipped booking screens). `DESIGN_SYSTEM.md` §12.9 lists a different tab set; Task 12 records the deviation.

## Global Constraints

- Relative imports only (no `@/` alias); tokens via NativeWind classes; no `#hex` in JSX (`src/lib/design/colors.ts` for SVG/Reanimated).
- Fonts: use `font-sans-medium|semibold|bold`, `font-display-*` — never `font-medium|semibold|bold`.
- Numbers (price, time, date) use `style={{ fontVariant: ["tabular-nums"] }}`.
- Hit targets ≥ 44×44; every icon-only/interactive element has `accessibilityRole` + `accessibilityLabel`.
- Jest `testMatch` is `**/*.test.ts` only — tests use `React.createElement`, not JSX.
- Client never grants authority: all mutations go through RPCs; `book_appointment`/`reschedule_appointment`/`cancel_appointment` remain authoritative (90-minute customer cutoff is DB-enforced; UI only mirrors it).
- Stable SQLSTATEs: new codes `P0017` (profile invalid), `P0018` (account deletion blocked). Unauthenticated/forbidden = `42501`.
- Timezone: shop-local dates via `src/lib/dates/shop-time.ts` (`America/Sao_Paulo`).
- Baseline before this plan: `npm run typecheck` clean; `npm test -- --runInBand` = 41 suites / 167 tests passing.
- Every task ends with typecheck + its focused tests green before commit; commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Known unrelated failure: pgTAP `010_full_rls.sql` seed-count mismatch on clean `main` — not a blocker.

## File Structure

```
supabase/migrations/0023_customer_self_service.sql   NEW  RPCs + consents + anonymization column
supabase/tests/011_customer_self_service.sql         NEW  pgTAP
supabase/functions/delete-account/index.ts           NEW  Edge Function (service role)
src/features/account/api.ts                          NEW  ensureMyCustomer/updateMyProfile/exportMyData/deleteMyAccount/buildExportFile
src/features/account/export-file.ts                  NEW  saveExportFile (web download / native Share)
src/features/account/legal.ts                        NEW  TERMS_VERSION + legal copy
src/features/auth/api.ts                             MOD  + signUpCustomer
src/features/auth/validation.ts                      NEW  parseSignupInput (zod)
src/features/auth/session.ts                         MOD  GROUP_ROLE table + legal exemption
src/features/customers/api.ts                        MOD  export toCustomer/customerColumns
src/features/shops/api.ts                            NEW  listPublicShops
src/features/appointments/agenda-view.ts             NEW  pure grouping/label helpers
src/features/appointments/use-appointment-cards.ts   NEW  hook: appointment -> AppointmentCard props
src/lib/errors/domain-errors.ts                      MOD  + PROFILE_INVALID, ACCOUNT_DELETION_BLOCKED
src/components/domain/BottomTabBar.tsx               NEW  (+ barrel export)
src/components/domain/AppointmentCard.tsx            MOD  shopAddress optional
app/index.tsx                                        MOD  customers -> /home; owner hub unchanged
app/legal.tsx                                        NEW
app/(auth)/{login,signup,forgot-password}.tsx        REWRITE (signup NEW)
app/(customer)/_layout.tsx                           NEW  Tabs + customer bootstrap
app/(customer)/{home,agenda,reschedule,profile}.tsx  NEW/REWRITE
app/(customer)/book/*                                MOVED from app/(public)/book/*
app/(customer)/{appointments,history}.tsx            DELETE
tests/…                                              see each task
```

---

### Task 1: Migration `0023` + pgTAP

**Files:**
- Create: `supabase/migrations/0023_customer_self_service.sql`
- Create: `supabase/tests/011_customer_self_service.sql`

**Interfaces:**
- Produces (all `security definer`, `set search_path = pg_catalog, public, pg_temp`, execute granted to `authenticated` only):
  - `ensure_my_customer() returns public.customers`
  - `update_my_profile(p_full_name text, p_phone text) returns public.customers`
  - `export_my_data() returns jsonb`
  - `prepare_account_deletion() returns void`
  - table `public.consents(id, user_id, kind, version, accepted_at)`; column `customers.anonymized_at`

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/011_customer_self_service.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't11-owner@example.com', 'password-hash', now(), '{"full_name":"T11 Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't11-customer@example.com', 'password-hash', now(), '{"full_name":"T11 Customer","phone":"+55 11 90000-1111","accepted_terms_version":"2026-09-23"}'),
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't11-other@example.com', 'password-hash', now(), '{"full_name":"T11 Other"}');

update public.profiles set role = 'owner' where user_id = '70000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('71000000-0000-0000-0000-000000000001', 'T11 Shop', '70000000-0000-0000-0000-000000000001');

select set_config('t11.shop', (select id::text from public.shops order by created_at, id limit 1), false);

insert into public.barbers (id, shop_id, name)
values ('72000000-0000-0000-0000-000000000001', current_setting('t11.shop')::uuid, 'T11 Barber');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('73000000-0000-0000-0000-000000000001', current_setting('t11.shop')::uuid, 'T11 Cut', 30, 4000);
insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('74000000-0000-0000-0000-000000000001', current_setting('t11.shop')::uuid, '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001');

-- customer
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select full_name from public.ensure_my_customer()), 'T11 Customer', 'ensure_my_customer creates the row from the profile name');
select is((select phone from public.ensure_my_customer()), '+55 11 90000-1111', 'phone comes from signup metadata');
select is((select count(*)::int from public.customers where user_id = '70000000-0000-0000-0000-000000000002'), 1, 'ensure_my_customer is idempotent');
select is((select count(*)::int from public.consents where user_id = '70000000-0000-0000-0000-000000000002'), 2, 'terms and privacy consents recorded once each');

-- other customer cannot read consents
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.consents), 0, 'other users cannot read someone else''s consents');

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$ select public.ensure_my_customer() $$, '42501', null, 'anonymous callers cannot ensure a customer');

-- owner
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select public.ensure_my_customer() $$, '42501', null, 'owners cannot create a customer self row');

-- profile update
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select full_name from public.update_my_profile('T11 Renamed', '+55 11 91111-2222')), 'T11 Renamed', 'update_my_profile updates the customer row');
select is((select full_name from public.profiles where user_id = '70000000-0000-0000-0000-000000000002'), 'T11 Renamed', 'update_my_profile updates the profile');
select throws_ok($$ select public.update_my_profile('T11 Renamed', 'abc') $$, 'P0017', null, 'invalid phone rejected');
select throws_ok($$ select public.update_my_profile('   ', null) $$, 'P0017', null, 'blank name rejected');

-- appointment fixture (superuser)
reset role;
insert into public.appointments (
  id, shop_id, barber_id, customer_id, barber_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
)
select '75000000-0000-0000-0000-000000000001', shop_id, '72000000-0000-0000-0000-000000000001', id,
  '74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001',
  now() + interval '3 days', now() + interval '3 days 30 minutes', now() + interval '3 days 30 minutes',
  'T11 Cut', 30, 4000, 0
from public.customers where user_id = '70000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.export_my_data() -> 'appointments'), 1, 'export includes the caller''s appointments');
select throws_ok($$ select public.prepare_account_deletion() $$, 'P0018', null, 'deletion blocked while an upcoming appointment exists');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(jsonb_array_length(public.export_my_data() -> 'appointments'), 0, 'export never includes another user''s appointments');

-- deletion after cancelling
reset role;
update public.appointments set status = 'cancelled' where id = '75000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok($$ select public.prepare_account_deletion() $$, 'deletion allowed once nothing upcoming remains');

reset role;
select is((select full_name from public.customers where id = (select customer_id from public.appointments where id = '75000000-0000-0000-0000-000000000001')), 'Cliente removido', 'customer row anonymized');
select is((select count(*)::int from public.appointments where id = '75000000-0000-0000-0000-000000000001'), 1, 'appointment history retained');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/011_customer_self_service.sql`
Expected: FAIL (`function public.ensure_my_customer() does not exist`). If the local stack is not running: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase start` first (needs Docker). If Docker/Supabase cannot run in this environment, record that in the task report and continue — do not claim DB verification.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0023_customer_self_service.sql`:

```sql
alter table public.customers add column anonymized_at timestamptz;

alter table public.customers drop constraint customers_contact_present;
alter table public.customers add constraint customers_contact_present
  check (email is not null or phone is not null or user_id is not null or anonymized_at is not null);

create unique index customers_shop_user_key
  on public.customers (shop_id, user_id) where user_id is not null;

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (user_id) on delete set null,
  kind text not null check (kind in ('terms', 'privacy')),
  version text not null check (btrim(version) <> ''),
  accepted_at timestamptz not null default clock_timestamp(),
  unique (user_id, kind, version)
);

revoke all on table public.consents from anon, authenticated;
grant select on table public.consents to authenticated;
alter table public.consents enable row level security;

create policy "consents_select_self"
on public.consents
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.ensure_my_customer()
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  shop uuid;
  account_email text;
  meta jsonb;
  consent_version text;
  result public.customers;
begin
  if actor is null
    or coalesce((select role::text from public.profiles where user_id = actor), '') <> 'customer'
  then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select id into shop from public.shops order by created_at, id limit 1;
  if shop is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  select email, coalesce(raw_user_meta_data, '{}'::jsonb) into account_email, meta
  from auth.users where id = actor;

  select * into result from public.customers where shop_id = shop and user_id = actor;
  if not found then
    insert into public.customers (shop_id, user_id, full_name, email, phone)
    values (
      shop,
      actor,
      coalesce((select full_name from public.profiles where user_id = actor), split_part(account_email, '@', 1)),
      account_email,
      nullif(btrim(meta ->> 'phone'), '')
    )
    returning * into result;
  end if;

  consent_version := nullif(btrim(meta ->> 'accepted_terms_version'), '');
  if consent_version is not null then
    insert into public.consents (user_id, kind, version)
    values (actor, 'terms', consent_version), (actor, 'privacy', consent_version)
    on conflict do nothing;
  end if;

  return result;
end;
$$;

create or replace function public.update_my_profile(p_full_name text, p_phone text)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  result public.customers;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if btrim(coalesce(p_full_name, '')) = ''
    or (nullif(btrim(p_phone), '') is not null and btrim(p_phone) !~ '^[0-9+()\s-]{8,20}$')
  then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name), updated_at = clock_timestamp()
  where user_id = actor;

  update public.customers
  set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''), updated_at = clock_timestamp()
  where user_id = actor
  returning * into result;

  return result;
end;
$$;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'exported_at', clock_timestamp(),
    'account_email', (select email from auth.users where id = actor),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = actor),
    'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.customers c where c.user_id = actor), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.starts_at)
      from public.appointments a
      join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'recurrence_series', coalesce((
      select jsonb_agg(to_jsonb(s))
      from public.recurrence_series s
      join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
      where c.user_id = actor
    ), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(k) order by k.accepted_at) from public.consents k where k.user_id = actor), '[]'::jsonb),
    'notification_tokens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', t.platform, 'active', t.active,
        'token_suffix', right(t.expo_push_token, 6), 'created_at', t.created_at))
      from public.notification_tokens t where t.user_id = actor
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.prepare_account_deletion()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.appointments a
    join public.customers c on c.id = a.customer_id and c.shop_id = a.shop_id
    where c.user_id = actor
      and a.status in ('scheduled', 'confirmed')
      and a.starts_at > clock_timestamp()
  ) or exists (
    select 1
    from public.recurrence_series s
    join public.customers c on c.id = s.customer_id and c.shop_id = s.shop_id
    where c.user_id = actor and s.active
  ) then
    raise exception using errcode = 'P0018', message = 'ACCOUNT_DELETION_BLOCKED';
  end if;

  update public.customers
  set full_name = 'Cliente removido',
      email = null,
      phone = null,
      user_id = null,
      anonymized_at = clock_timestamp(),
      active = false,
      archived_at = coalesce(archived_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where user_id = actor;
end;
$$;

revoke all on function public.ensure_my_customer() from public, anon;
revoke all on function public.update_my_profile(text, text) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.prepare_account_deletion() from public, anon;
grant execute on function public.ensure_my_customer() to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
```

- [ ] **Step 4: Run to verify it passes**

Run: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local && HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase test db --local supabase/tests/011_customer_self_service.sql`
Expected: PASS, 17 assertions. Fix migration/test until green (the fixture's direct `update ... status = 'cancelled'` may hit a lifecycle trigger — if so, set the status through the same mechanism 006 uses).

- [ ] **Step 5: Regression + commit**

Run: `HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run test:db` — expect only the known `010_full_rls.sql` seed-count mismatch.

```bash
git add supabase/migrations/0023_customer_self_service.sql supabase/tests/011_customer_self_service.sql
git commit -m "feat(db): add customer self-service RPCs, consents and account anonymization"
```

---

### Task 2: Account API client + domain errors

**Files:**
- Modify: `src/lib/errors/domain-errors.ts`
- Modify: `src/features/customers/api.ts` (export `toCustomer`, `customerColumns`)
- Create: `src/features/account/api.ts`
- Test: `tests/integration/account.test.ts`

**Interfaces:**
- Consumes: `toCustomer(row: CustomerRow): Customer` (export it), `DomainError`, `toDomainError`.
- Produces:
  - `ensureMyCustomer(supabase: Pick<SupabaseClient,"rpc">): Promise<Customer>`
  - `updateMyProfile(supabase, input: { fullName: string; phone: string | null }): Promise<Customer>`
  - `exportMyData(supabase): Promise<Record<string, unknown>>`
  - `buildExportFile(data: Record<string, unknown>, now?: Date): { filename: string; mimeType: string; content: string }`
  - `deleteMyAccount(supabase: Pick<SupabaseClient,"functions">): Promise<void>`
  - `DomainErrorCode` gains `"PROFILE_INVALID" | "ACCOUNT_DELETION_BLOCKED" | "ACCOUNT_REQUEST_FAILED"`.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/account.test.ts`:

```ts
import {
  buildExportFile,
  deleteMyAccount,
  ensureMyCustomer,
  exportMyData,
  updateMyProfile,
} from "../../src/features/account/api";

const customerRow = {
  active: true, archived_at: null, email: "ana@example.com", full_name: "Ana",
  id: "customer-1", phone: null, shop_id: "shop-1", user_id: "user-1",
};

describe("account api", () => {
  it("ensureMyCustomer calls the RPC and maps the row", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: customerRow, error: null });

    await expect(ensureMyCustomer({ rpc } as never)).resolves.toMatchObject({
      fullName: "Ana", id: "customer-1", userId: "user-1",
    });
    expect(rpc).toHaveBeenCalledWith("ensure_my_customer");
  });

  it("updateMyProfile sends p_-prefixed parameters", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ...customerRow, full_name: "Ana B", phone: "+55 11 90000-0000" }, error: null });

    await expect(updateMyProfile({ rpc } as never, { fullName: "Ana B", phone: "+55 11 90000-0000" }))
      .resolves.toMatchObject({ fullName: "Ana B", phone: "+55 11 90000-0000" });
    expect(rpc).toHaveBeenCalledWith("update_my_profile", { p_full_name: "Ana B", p_phone: "+55 11 90000-0000" });
  });

  it("maps P0017 to PROFILE_INVALID", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0017" } });

    await expect(updateMyProfile({ rpc } as never, { fullName: " ", phone: null }))
      .rejects.toMatchObject({ code: "PROFILE_INVALID" });
  });

  it("maps other RPC failures to ACCOUNT_REQUEST_FAILED, not a booking error", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "XX000" } });

    await expect(ensureMyCustomer({ rpc } as never)).rejects.toMatchObject({ code: "ACCOUNT_REQUEST_FAILED" });
  });

  it("exportMyData returns the JSON document", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { appointments: [] }, error: null });

    await expect(exportMyData({ rpc } as never)).resolves.toEqual({ appointments: [] });
    expect(rpc).toHaveBeenCalledWith("export_my_data");
  });

  it("buildExportFile names the file by UTC date and pretty-prints", () => {
    const file = buildExportFile({ a: 1 }, new Date("2026-09-23T15:00:00Z"));

    expect(file).toEqual({
      content: JSON.stringify({ a: 1 }, null, 2),
      filename: "barberschedule-my-data-2026-09-23.json",
      mimeType: "application/json",
    });
  });

  it("deleteMyAccount resolves on success", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: {}, error: null });

    await expect(deleteMyAccount({ functions: { invoke } } as never)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("delete-account", { method: "POST" });
  });

  it("deleteMyAccount maps a blocked response to ACCOUNT_DELETION_BLOCKED", async () => {
    const error = { context: { json: async () => ({ code: "ACCOUNT_DELETION_BLOCKED" }) } };
    const invoke = jest.fn().mockResolvedValue({ data: null, error });

    await expect(deleteMyAccount({ functions: { invoke } } as never))
      .rejects.toMatchObject({ code: "ACCOUNT_DELETION_BLOCKED" });
  });

  it("deleteMyAccount maps unknown failures to ACCOUNT_REQUEST_FAILED", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: new Error("boom") });

    await expect(deleteMyAccount({ functions: { invoke } } as never))
      .rejects.toMatchObject({ code: "ACCOUNT_REQUEST_FAILED" });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- --runInBand tests/integration/account.test.ts`
Expected: FAIL (`Cannot find module '../../src/features/account/api'`).

- [ ] **Step 3: Implement**

In `src/lib/errors/domain-errors.ts` add `| "PROFILE_INVALID" | "ACCOUNT_DELETION_BLOCKED" | "ACCOUNT_REQUEST_FAILED"` to `DomainErrorCode`, and inside `toDomainError`'s switch (before `default`):

```ts
    case "P0017":
      return new DomainError("PROFILE_INVALID", "Enter your name and a valid phone number.");
    case "P0018":
      return new DomainError(
        "ACCOUNT_DELETION_BLOCKED",
        "Cancel your upcoming appointments (or contact the shop about your recurring schedule) before deleting your account.",
      );
```

In `src/features/customers/api.ts` change `function toCustomer` → `export function toCustomer` and `const customerColumns` → `export const customerColumns`.

Create `src/features/account/api.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { toCustomer } from "../customers/api";
import type { CustomerRow } from "../customers/types";

type RpcClient = Pick<SupabaseClient, "rpc">;

function toAccountError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("ACCOUNT_REQUEST_FAILED", "Something went wrong. Please try again.")
    : domainError;
}

async function callRpc(supabase: RpcClient, name: string, args?: Record<string, unknown>) {
  const { data, error } = args ? await supabase.rpc(name, args) : await supabase.rpc(name);

  if (error) {
    throw toAccountError(error);
  }

  return data;
}

export async function ensureMyCustomer(supabase: RpcClient) {
  return toCustomer((await callRpc(supabase, "ensure_my_customer")) as CustomerRow);
}

export async function updateMyProfile(
  supabase: RpcClient,
  input: { fullName: string; phone: string | null },
) {
  const row = await callRpc(supabase, "update_my_profile", {
    p_full_name: input.fullName,
    p_phone: input.phone,
  });

  return toCustomer(row as CustomerRow);
}

export async function exportMyData(supabase: RpcClient) {
  return (await callRpc(supabase, "export_my_data")) as Record<string, unknown>;
}

export function buildExportFile(data: Record<string, unknown>, now = new Date()) {
  return {
    content: JSON.stringify(data, null, 2),
    filename: `barberschedule-my-data-${now.toISOString().slice(0, 10)}.json`,
    mimeType: "application/json",
  };
}

export async function deleteMyAccount(supabase: Pick<SupabaseClient, "functions">) {
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });

  if (!error) {
    return;
  }

  const context = (error as { context?: { json?: () => Promise<{ code?: string }> } }).context;
  const body = await context?.json?.().catch(() => null);

  throw body?.code === "ACCOUNT_DELETION_BLOCKED"
    ? toDomainError({ code: "P0018" })
    : new DomainError("ACCOUNT_REQUEST_FAILED", "Something went wrong. Please try again.");
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run typecheck && npm test -- --runInBand tests/integration/account.test.ts tests/integration/lifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/errors/domain-errors.ts src/features/customers/api.ts src/features/account/api.ts tests/integration/account.test.ts
git commit -m "feat: add account client (ensure customer, profile, export, delete)"
```

---

### Task 3: `delete-account` Edge Function

**Files:**
- Create: `supabase/functions/delete-account/index.ts`

**Interfaces:**
- Consumes: RPC `prepare_account_deletion` (Task 1), env `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `POST` → `200 {}` on success; `409 {code:"ACCOUNT_DELETION_BLOCKED"}`; `401 {code:"UNAUTHENTICATED"}`; `500 {code:"DELETION_FAILED"}`. (Matches what `deleteMyAccount` in Task 2 parses.)

No Deno test runner exists in this repo (the existing function has none either), so this task has no automated test; correctness rests on Task 1's pgTAP for the RPC and Task 2's contract tests for the response shape. State that limitation in the task report.

- [ ] **Step 1: Write the function**

```ts
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json(401, { code: "UNAUTHENTICATED" });

  const url = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) return json(401, { code: "UNAUTHENTICATED" });
  const { id: userId } = await userResponse.json() as { id: string };

  const prepared = await fetch(`${url}/rest/v1/rpc/prepare_account_deletion`, {
    body: "{}",
    headers: { apikey: anonKey, Authorization: authorization, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!prepared.ok) {
    const body = await prepared.json().catch(() => ({})) as { code?: string };
    return body.code === "P0018"
      ? json(409, { code: "ACCOUNT_DELETION_BLOCKED" })
      : json(500, { code: "DELETION_FAILED" });
  }

  const deleted = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    method: "DELETE",
  });

  return deleted.ok ? json(200, {}) : json(500, { code: "DELETION_FAILED" });
});
```

- [ ] **Step 2: Sanity check**

Run: `npm run typecheck && npm run lint`
Expected: PASS (if `supabase/functions` is excluded by tsconfig/eslint, note it). If `deno` is installed, also run `deno check supabase/functions/delete-account/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/delete-account/index.ts
git commit -m "feat: add delete-account edge function"
```

---

### Task 4: Signup client + validation + legal constants

**Files:**
- Create: `src/features/auth/validation.ts`
- Modify: `src/features/auth/api.ts` (add `signUpCustomer`)
- Create: `src/features/account/legal.ts`
- Test: `tests/unit/signup-validation.test.ts`, extend `tests/integration/auth.test.ts`

**Interfaces:**
- Produces:
  - `parseSignupInput(input: unknown): { ok: true; value: SignupInput } | { ok: false; errors: Partial<Record<keyof SignupInput | "acceptedTerms", string>> }`
  - `type SignupInput = { fullName: string; email: string; phone: string | null; password: string; acceptedTerms: true }`
  - `signUpCustomer(supabase: Pick<AuthSupabaseClient,"auth">, input: SignupInput): Promise<{ needsEmailConfirmation: boolean }>`
  - `TERMS_VERSION = "2026-09-23"`, `LEGAL_SECTIONS: { title: string; body: string }[]`

- [ ] **Step 1: Write the failing tests**

`tests/unit/signup-validation.test.ts`:

```ts
import { parseSignupInput } from "../../src/features/auth/validation";

const valid = { acceptedTerms: true, email: "Ana@Example.com ", fullName: " Ana Silva ", password: "12345678", phone: "" };

describe("parseSignupInput", () => {
  it("normalizes a valid input (trim, lowercase email, empty phone -> null)", () => {
    expect(parseSignupInput(valid)).toEqual({
      ok: true,
      value: { acceptedTerms: true, email: "ana@example.com", fullName: "Ana Silva", password: "12345678", phone: null },
    });
  });

  it("requires accepting the terms", () => {
    const result = parseSignupInput({ ...valid, acceptedTerms: false });
    expect(result).toMatchObject({ ok: false, errors: { acceptedTerms: expect.any(String) } });
  });

  it.each([
    ["fullName", { fullName: "A" }],
    ["email", { email: "not-an-email" }],
    ["password", { password: "short" }],
    ["phone", { phone: "abc" }],
  ])("rejects a bad %s", (field, patch) => {
    const result = parseSignupInput({ ...valid, ...patch });
    expect(result).toMatchObject({ ok: false });
    expect((result as { errors: Record<string, string> }).errors[field]).toEqual(expect.any(String));
  });
});
```

Append to `tests/integration/auth.test.ts` (add `signUpCustomer` to the imports from `../../src/features/auth/api`):

```ts
describe("signUpCustomer", () => {
  const input = { acceptedTerms: true as const, email: "ana@example.com", fullName: "Ana", password: "12345678", phone: "+55 11 90000-0000" };

  it("sends profile data and the accepted terms version as auth metadata", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: { session: null }, error: null });

    await expect(signUpCustomer({ auth: { signUp } } as never, input)).resolves.toEqual({ needsEmailConfirmation: true });
    expect(signUp).toHaveBeenCalledWith({
      email: "ana@example.com",
      options: { data: { accepted_terms_version: "2026-09-23", full_name: "Ana", phone: "+55 11 90000-0000" } },
      password: "12345678",
    });
  });

  it("reports no confirmation needed when a session is returned", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });

    await expect(signUpCustomer({ auth: { signUp } } as never, input)).resolves.toEqual({ needsEmailConfirmation: false });
  });

  it("throws the auth error", async () => {
    const signUp = jest.fn().mockResolvedValue({ data: {}, error: new Error("User already registered") });

    await expect(signUpCustomer({ auth: { signUp } } as never, input)).rejects.toThrow("User already registered");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/signup-validation.test.ts tests/integration/auth.test.ts`
Expected: FAIL (modules/exports missing).

- [ ] **Step 3: Implement**

`src/features/account/legal.ts`:

```ts
export const TERMS_VERSION = "2026-09-23";

export const LEGAL_SECTIONS = [
  {
    title: "What we collect",
    body: "Your name, email address, optional phone number, your appointments (service, barber, date and time, notes) and, if you enable notifications, a push token for your device.",
  },
  {
    title: "Why we collect it",
    body: "To create your account, let you book, change and cancel appointments, remind you of them, and let the shop contact you about your schedule. Your phone number is optional.",
  },
  {
    title: "Who can see it",
    body: "You, and the barbershop you book with. We do not sell your data.",
  },
  {
    title: "Your rights (LGPD)",
    body: "In your profile you can correct your name and phone, download a copy of your data, and delete your account. Deleting your account removes your login and anonymizes your customer record; past appointments stay in the shop's records without your name, phone or email. Consent records are kept anonymously as proof of acceptance.",
  },
  {
    title: "Contact",
    body: "For any request about your data, contact the barbershop directly.",
  },
];
```

`src/features/auth/validation.ts`:

```ts
import { z } from "zod";

export type SignupInput = {
  acceptedTerms: true;
  email: string;
  fullName: string;
  password: string;
  phone: string | null;
};

const signupSchema = z.object({
  acceptedTerms: z.literal(true, { error: "Accept the terms and privacy policy to continue." }),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  fullName: z.string().trim().min(2, "Enter your full name."),
  password: z.string().min(8, "Use at least 8 characters."),
  phone: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || /^[0-9+()\s-]{8,20}$/.test(value), "Enter a valid phone number."),
});

export function parseSignupInput(input: unknown):
  | { ok: true; value: SignupInput }
  | { errors: Partial<Record<keyof SignupInput, string>>; ok: false } {
  const parsed = signupSchema.safeParse(input);

  if (parsed.success) {
    return { ok: true, value: parsed.data as SignupInput };
  }

  const errors: Partial<Record<keyof SignupInput, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof SignupInput;
    errors[key] ??= issue.message;
  }

  return { errors, ok: false };
}
```

Add to `src/features/auth/api.ts` (top import `import { TERMS_VERSION } from "../account/legal";` and `import type { SignupInput } from "./validation";`):

```ts
export async function signUpCustomer(
  supabase: Pick<AuthSupabaseClient, "auth">,
  input: SignupInput,
) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    options: {
      data: {
        accepted_terms_version: TERMS_VERSION,
        full_name: input.fullName,
        ...(input.phone ? { phone: input.phone } : {}),
      },
    },
    password: input.password,
  });
  throwIfError(error);

  return { needsEmailConfirmation: !data.session };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm test -- --runInBand tests/unit/signup-validation.test.ts tests/integration/auth.test.ts`
Expected: PASS. (If `z.email`/`z.literal` `error` option differs in the installed zod 4 minor, adjust to the installed API — the tests define the contract.)

- [ ] **Step 5: Commit**

```bash
git add src/features/auth src/features/account/legal.ts tests/unit/signup-validation.test.ts tests/integration/auth.test.ts
git commit -m "feat: add customer signup client, validation and legal copy"
```

---

### Task 5: Role guard table + public legal route

**Files:**
- Modify: `src/features/auth/session.ts`
- Modify: `tests/integration/auth.test.ts` (the `(public)` cases)

**Interfaces:**
- Produces: `resolveAuthRedirect` (same signature). `GROUP_ROLE: Record<string, AppRole>` internal; adding a role later = one entry. `segments[0] === "legal"` is exempt from all redirects. The `(public)` group no longer exists.

- [ ] **Step 1: Write/adjust failing tests**

Read the existing `(public)` cases in `tests/integration/auth.test.ts` and replace them with:

```ts
  it("lets anyone open the legal page, signed in or out", () => {
    expect(getRedirect({ segments: ["legal"] })).toBeNull();
    expect(getRedirect({ role: "customer", segments: ["legal"], session: createSession() })).toBeNull();
  });

  it("keeps customers inside the customer group", () => {
    expect(getRedirect({ role: "customer", segments: ["(customer)", "book"], session: createSession() })).toBeNull();
  });

  it("sends owners away from customer routes (booking moved into (customer))", () => {
    expect(getRedirect({ role: "owner", segments: ["(customer)", "book"], session: createSession() })).toBe("/");
  });
```
Delete any test that asserts on a `(public)` segment.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/integration/auth.test.ts`
Expected: FAIL on the `legal` cases (signed-out user redirected to `/login`).

- [ ] **Step 3: Implement**

Replace the body of `resolveAuthRedirect` in `src/features/auth/session.ts`:

```ts
const GROUP_ROLE: Record<string, AppRole> = {
  "(customer)": "customer",
  "(owner)": "owner",
};

export function resolveAuthRedirect({
  profileRole,
  segments,
  session,
}: ResolveAuthRedirectInput) {
  if (segments[0] === "legal") {
    return null;
  }

  const group = getTopLevelGroup(segments);

  if (!session) {
    return group === "(auth)" ? null : LOGIN_ROUTE;
  }

  if (group === "(auth)") {
    return HOME_ROUTE;
  }

  const requiredRole = group ? GROUP_ROLE[group] : undefined;

  return requiredRole && profileRole !== requiredRole ? HOME_ROUTE : null;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm test -- --runInBand tests/integration/auth.test.ts tests/unit/root-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/session.ts tests/integration/auth.test.ts
git commit -m "refactor: table-driven role guard and public legal route"
```

---

### Task 6: `BottomTabBar` + optional `shopAddress`

**Files:**
- Create: `src/components/domain/BottomTabBar.tsx`
- Modify: `src/components/domain/index.ts`, `src/components/domain/AppointmentCard.tsx`
- Test: `tests/unit/bottom-tab-bar.test.ts`, extend `tests/unit/appointment-card.test.ts`, `tests/unit/component-exports.test.ts`

**Interfaces:**
- Produces:
  - `type BottomTabItem = { key: string; label: string; icon: LucideIcon }` (`LucideIcon` from `lucide-react-native`)
  - `BottomTabBar({ items, activeKey, onSelect, testID? })` — each tab `testID="tab-<key>"`, `accessibilityRole="tab"`, `accessibilityLabel=<label>`, `accessibilityState.selected`.
  - `AppointmentCardProps.shopAddress?: string` — when absent the footer shows just the shop name.

- [ ] **Step 1: Write the failing tests**

`tests/unit/bottom-tab-bar.test.ts`:

```ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { CalendarDays, House } from "lucide-react-native";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";

const items = [
  { icon: House, key: "home", label: "Home" },
  { icon: CalendarDays, key: "agenda", label: "Agenda" },
];

describe("BottomTabBar", () => {
  it("renders a labelled tab per item", async () => {
    const view = await render(React.createElement(BottomTabBar, { activeKey: "home", items, onSelect: jest.fn() }));

    expect(view.getByLabelText("Home")).toBeTruthy();
    expect(view.getByLabelText("Agenda")).toBeTruthy();
  });

  it("marks only the active tab as selected", async () => {
    const view = await render(React.createElement(BottomTabBar, { activeKey: "agenda", items, onSelect: jest.fn() }));

    expect(view.getByTestId("tab-agenda").props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(view.getByTestId("tab-home").props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
  });

  it("calls onSelect with the tapped key", async () => {
    const onSelect = jest.fn();
    const view = await render(React.createElement(BottomTabBar, { activeKey: "home", items, onSelect }));

    await fireEvent.press(view.getByTestId("tab-agenda"));

    expect(onSelect).toHaveBeenCalledWith("agenda");
  });
});
```

Append to `tests/unit/appointment-card.test.ts` (use that file's existing base props object — read it first and reuse its name):

```ts
  it("omits the address separator when shopAddress is not provided", async () => {
    const { shopAddress: _omitted, ...withoutAddress } = baseProps;
    const view = await render(React.createElement(AppointmentCard, withoutAddress));

    expect(view.getByText("Alpha Barbershop")).toBeTruthy();
    expect(view.queryByText(/·\s*$/)).toBeNull();
  });
```
(Adapt `baseProps` and the shop name to whatever that test file already defines.) Add `expect(domain.BottomTabBar).toBeDefined();` to `tests/unit/component-exports.test.ts`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/bottom-tab-bar.test.ts tests/unit/appointment-card.test.ts tests/unit/component-exports.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/components/domain/BottomTabBar.tsx`:

```tsx
import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type BottomTabItem = { key: string; label: string; icon: LucideIcon };

export type BottomTabBarProps = {
  items: BottomTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  testID?: string;
};

export function BottomTabBar({ items, activeKey, onSelect, testID }: BottomTabBarProps) {
  return (
    <View accessibilityRole="tablist" className="flex-row border-t border-neutral-200 bg-surface" testID={testID}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const Icon = item.icon;

        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="min-h-[56px] min-w-[44px] flex-1 items-center justify-center gap-0.5"
            key={item.key}
            onPress={() => onSelect(item.key)}
            testID={`tab-${item.key}`}
          >
            <Icon color={active ? colors.primary[600] : colors.neutral[400]} size={24} />
            <Text className={`text-xs ${active ? "font-sans-semibold text-primary-600" : "font-sans-medium text-neutral-400"}`}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

`AppointmentCard.tsx`: change `shopAddress: string;` → `shopAddress?: string;` and the footer text to
`{shopAddress ? `${shopName} · ${shopAddress}` : shopName}`.

`index.ts`: add
```ts
export { BottomTabBar } from "./BottomTabBar";
export type { BottomTabBarProps, BottomTabItem } from "./BottomTabBar";
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm test -- --runInBand tests/unit`
Expected: PASS. (If `colors.primary[600]`/`colors.neutral[400]` are missing, use the closest existing keys from `src/lib/design/colors.ts` and keep the active/inactive contrast.)

- [ ] **Step 5: Commit**

```bash
git add src/components/domain tests/unit
git commit -m "feat: add BottomTabBar and make AppointmentCard shopAddress optional"
```

---

### Task 7: Agenda view helpers, shops API, card-props hook

**Files:**
- Create: `src/features/appointments/agenda-view.ts`, `src/features/shops/api.ts`, `src/features/appointments/use-appointment-cards.ts`
- Modify: `app/(public)/book/index.tsx` (use `listPublicShops`)
- Test: `tests/unit/agenda-view.test.ts`

**Interfaces:**
- Produces:
  - `groupByLocalDate(appointments: Appointment[]): Map<string, Appointment[]>` (keys = shop-local `YYYY-MM-DD`, each list ascending by `startsAt`)
  - `formatAppointmentLabels(appointment: Appointment): { dateLabel: string; timeLabel: string }` (`"Mon, 17 Aug"`, `"09:00"`)
  - `pickInitialDate(days: CalendarStripDay[], grouped: Map<string, Appointment[]>): string` (first day with an appointment, else first day)
  - `markAppointmentDays(days: CalendarStripDay[], grouped): CalendarStripDay[]` (sets `hasAppointment`)
  - `listPublicShops(supabase): Promise<{ id: string; name: string }[]>`
  - `useAppointmentCards(appointments: Appointment[]): (a: Appointment) => Omit<AppointmentCardProps, "onPress" | "testID">`

- [ ] **Step 1: Write the failing test**

`tests/unit/agenda-view.test.ts`:

```ts
import {
  formatAppointmentLabels, groupByLocalDate, markAppointmentDays, pickInitialDate,
} from "../../src/features/appointments/agenda-view";
import type { Appointment } from "../../src/features/appointments/types";

function appointment(id: string, startsAt: string): Appointment {
  return {
    barberBufferMinutesSnapshot: 0, barberId: "b", barberServiceId: "bs", createdAt: startsAt,
    customerId: "c", endsAt: startsAt, id, notes: null, occupiedUntil: startsAt,
    serviceDurationMinutesSnapshot: 30, serviceId: "s", serviceNameSnapshot: "Cut",
    servicePriceCentsSnapshot: 4000, shopId: "shop", source: "customer", startsAt,
    status: "scheduled", updatedAt: startsAt,
  };
}

const days = [
  { date: "2026-08-17", dayNumber: "17", weekdayLabel: "Mon" },
  { date: "2026-08-18", dayNumber: "18", weekdayLabel: "Tue" },
];

describe("agenda view helpers", () => {
  it("groups by shop-local date, not UTC date", () => {
    // 2026-08-18T01:00Z is 2026-08-17 22:00 in America/Sao_Paulo
    const grouped = groupByLocalDate([appointment("late", "2026-08-18T01:00:00Z"), appointment("early", "2026-08-17T12:00:00Z")]);

    expect([...grouped.keys()]).toEqual(["2026-08-17"]);
    expect(grouped.get("2026-08-17")?.map((a) => a.id)).toEqual(["early", "late"]);
  });

  it("formats labels in shop-local time", () => {
    expect(formatAppointmentLabels(appointment("a", "2026-08-17T12:00:00Z"))).toEqual({
      dateLabel: "Mon, 17 Aug",
      timeLabel: "09:00",
    });
  });

  it("marks days that have appointments", () => {
    const grouped = groupByLocalDate([appointment("a", "2026-08-18T13:00:00Z")]);

    expect(markAppointmentDays(days, grouped).map((d) => d.hasAppointment)).toEqual([false, true]);
  });

  it("selects the first day with an appointment, else the first day", () => {
    expect(pickInitialDate(days, groupByLocalDate([appointment("a", "2026-08-18T13:00:00Z")]))).toBe("2026-08-18");
    expect(pickInitialDate(days, new Map())).toBe("2026-08-17");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/agenda-view.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/features/appointments/agenda-view.ts`:

```ts
import type { CalendarStripDay } from "../../components/domain/CalendarStrip";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import type { Appointment } from "./types";

const labelFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", timeZone: "UTC", weekday: "short",
});

export function groupByLocalDate(appointments: Appointment[]) {
  const grouped = new Map<string, Appointment[]>();
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  for (const appointment of sorted) {
    const { localDate } = formatInstantInShopTime(new Date(appointment.startsAt));
    grouped.set(localDate, [...(grouped.get(localDate) ?? []), appointment]);
  }

  return grouped;
}

export function formatAppointmentLabels(appointment: Appointment) {
  const { localDate, localTime } = formatInstantInShopTime(new Date(appointment.startsAt));

  return {
    dateLabel: labelFormatter.format(new Date(`${localDate}T12:00:00Z`)).replace(/^(\w+) /, "$1, "),
    timeLabel: localTime,
  };
}

export function markAppointmentDays(days: CalendarStripDay[], grouped: Map<string, Appointment[]>) {
  return days.map((day) => ({ ...day, hasAppointment: grouped.has(day.date) }));
}

export function pickInitialDate(days: CalendarStripDay[], grouped: Map<string, Appointment[]>) {
  return days.find((day) => grouped.has(day.date))?.date ?? days[0].date;
}
```
(The en-GB formatter renders `"Mon 17 Aug"`; the `replace` turns it into `"Mon, 17 Aug"`. If the ICU build renders differently, adjust the formatting — the test defines the contract.)

`src/features/shops/api.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicShop = { id: string; name: string };

export async function listPublicShops(supabase: Pick<SupabaseClient, "from">) {
  const { data, error } = await supabase.from("shops").select("id, name").order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as PublicShop[];
}
```

`src/features/appointments/use-appointment-cards.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import type { AppointmentCardProps } from "../../components/domain/AppointmentCard";
import { useSupabaseSession } from "../../providers/AppProviders";
import { listPublicBarbers } from "../barbers/api";
import { listPublicShops } from "../shops/api";
import { formatAppointmentLabels } from "./agenda-view";
import type { Appointment } from "./types";

export function useAppointmentCards(appointments: Appointment[]) {
  const { supabase } = useSupabaseSession();
  // Single-shop MVP: every appointment belongs to the same shop.
  const shopId = appointments[0]?.shopId ?? "";
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const barbers = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicBarbers(supabase, shopId),
    queryKey: ["public-barbers", shopId],
  });

  return (appointment: Appointment): Omit<AppointmentCardProps, "onPress" | "testID"> => ({
    ...formatAppointmentLabels(appointment),
    barberName: barbers.data?.find((barber) => barber.id === appointment.barberId)?.name ?? "Barber",
    serviceName: appointment.serviceNameSnapshot,
    shopName: shops.data?.find((shop) => shop.id === appointment.shopId)?.name ?? "Barbershop",
    status: appointment.status,
  });
}
```

In `app/(public)/book/index.tsx` replace the inline `queryFn` with `() => listPublicShops(supabase)` (import from `../../../src/features/shops/api`; drop the local `Shop` type).

- [ ] **Step 4: Run to verify pass**

Run: `npm run typecheck && npm test -- --runInBand tests/unit/agenda-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/appointments src/features/shops tests/unit/agenda-view.test.ts "app/(public)/book/index.tsx"
git commit -m "feat: add agenda view helpers, shops api and appointment card hook"
```

---

### Task 8: Customer routing — tabs layout, bootstrap, home, moved booking

**Files:**
- Move: `app/(public)/book/*` → `app/(customer)/book/*` (`git mv`; fix relative imports `../../../src` stays valid because depth is unchanged)
- Create: `app/(customer)/_layout.tsx`, `app/(customer)/book/_layout.tsx`, `app/(customer)/home.tsx`
- Modify: `app/(customer)/book/index.tsx` (auto-skip single shop), `app/index.tsx`
- Delete: `app/(customer)/appointments.tsx`, `app/(customer)/history.tsx` (replaced in Task 10; leave `profile.tsx` until Task 11)

**Interfaces:**
- Consumes: `ensureMyCustomer`, `BottomTabBar`, `useAppointmentCards`, `listMyAppointments`.
- Produces: routes `/home`, `/book`, `/agenda` (Task 10), `/profile` (Task 11). Tab keys: `home | book | agenda | profile`. Query key `["ensure-my-customer", userId]`.

UI verification is Playwright (Task 12) plus a browser check here; screens have no Jest tests by repo convention.

- [ ] **Step 1: Move booking and delete old customer screens**

```bash
mkdir -p "app/(customer)/book"
git mv app/\(public\)/book/index.tsx app/\(public\)/book/barber.tsx app/\(public\)/book/service.tsx app/\(public\)/book/date.tsx app/\(public\)/book/review.tsx "app/(customer)/book/"
git rm -q "app/(customer)/appointments.tsx" "app/(customer)/history.tsx"
ls app/\(public\) 2>/dev/null   # expect empty/missing
```

- [ ] **Step 2: Booking stack layout and single-shop skip**

`app/(customer)/book/_layout.tsx`:

```tsx
import { Stack } from "expo-router";

export default function BookLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

In `app/(customer)/book/index.tsx` add `Redirect` from `expo-router` and, right after the `shops` query:

```tsx
  if (shops.data?.length === 1) {
    return <Redirect href={`/book/barber?shopId=${encodeURIComponent(shops.data[0].id)}`} />;
  }
```

- [ ] **Step 3: Tabs layout with customer bootstrap**

`app/(customer)/_layout.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { CalendarDays, CalendarPlus, House, User } from "lucide-react-native";
import { SafeAreaView, Text, View } from "react-native";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { ensureMyCustomer } from "../../src/features/account/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const ITEMS = [
  { icon: House, key: "home", label: "Home" },
  { icon: CalendarPlus, key: "book", label: "Book" },
  { icon: CalendarDays, key: "agenda", label: "Agenda" },
  { icon: User, key: "profile", label: "Profile" },
];
const ACTIVE_TAB: Record<string, string> = { reschedule: "agenda" };

export default function CustomerLayout() {
  const { profile, supabase } = useSupabaseSession();
  const bootstrap = useQuery({
    enabled: profile?.role === "customer",
    queryFn: () => ensureMyCustomer(supabase),
    queryKey: ["ensure-my-customer", profile?.userId],
    staleTime: Infinity,
  });

  if (bootstrap.isError) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Text className="text-base font-sans text-danger-500">Unable to set up your account.</Text>
          <Button label="Try again" onPress={() => void bootstrap.refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  if (!bootstrap.data) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <View className="items-center gap-3 p-5">
          <SkeletonBlock height={56} width={320} />
          <SkeletonBlock height={56} width={320} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ navigation, state }) => {
        const name = state.routes[state.index].name;

        return (
          <BottomTabBar
            activeKey={ACTIVE_TAB[name] ?? name}
            items={ITEMS}
            onSelect={(key) => navigation.navigate(key)}
          />
        );
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="book" />
      <Tabs.Screen name="agenda" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="reschedule" options={{ href: null }} />
    </Tabs>
  );
}
```
(`agenda` and `reschedule` do not exist until Task 10; create empty placeholder-free stubs only if the router errors — otherwise this task's browser check covers `home`/`book`/`profile` and Task 10 lands the rest before the gate.)

- [ ] **Step 4: Home screen and root dispatcher**

`app/(customer)/home.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { listMyAppointments } from "../../src/features/appointments/lifecycle";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { listMyCustomers } from "../../src/features/customers/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const toCardProps = useAppointmentCards(upcoming.data ?? []);
  const next = upcoming.data?.[0];
  const firstName = customers.data?.[0]?.fullName.split(" ")[0];

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {firstName ? `Hi, ${firstName}` : "Welcome"}
          </Text>
          <View className="w-full max-w-[420px] gap-3">
            <Text className="text-sm font-sans-medium text-neutral-600">Your next appointment</Text>
            {upcoming.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {upcoming.error ? <Text className="text-sm font-sans text-danger-500">Unable to load appointments.</Text> : null}
            {!upcoming.isLoading && !upcoming.error && !next ? <EmptyState title="No upcoming appointments" /> : null}
            {next ? <AppointmentCard {...toCardProps(next)} onPress={() => router.push("/agenda")} testID="home-next-appointment" /> : null}
            <Button label="Book an appointment" onPress={() => router.push("/book")} size="lg" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

`app/index.tsx`: add `import { Link, Redirect } from "expo-router";`, then at the top of `HomeScreen` after the hooks:

```tsx
  if (profile?.role === "customer") {
    return <Redirect href="/home" />;
  }
```
and delete the whole `{profile?.role === "customer" ? (...) : null}` block. Owner hub unchanged.

- [ ] **Step 5: Verify in the browser**

Run `npm run typecheck && npm run lint`. Then start the web dev server (`npm run web`) and, with the Browser tools or the Playwright e2e in Task 12, confirm: `/book` (single shop) skips to the barber list; tab bar shows 4 tabs; tapping tabs navigates. If Task 10/11 routes are still missing, expect Expo Router warnings only for `agenda`/`reschedule` — note them; do not stub.

- [ ] **Step 6: Commit**

```bash
git add -A app
git commit -m "feat: customer tab layout with account bootstrap, home screen, booking under (customer)"
```

---

### Task 9: Auth screens + legal screen

**Files:**
- Rewrite: `app/(auth)/login.tsx`, `app/(auth)/forgot-password.tsx`
- Create: `app/(auth)/signup.tsx`, `app/legal.tsx`
- Modify: `app/(auth)/_layout.tsx` only if it needs `Stack` screens (read it first)

**Interfaces:**
- Consumes: `signInWithPassword`, `requestPasswordReset`, `signUpCustomer`, `parseSignupInput`, `LEGAL_SECTIONS`, `TERMS_VERSION`; `Input`, `Button`, `Toast`.
- Preserves e2e-asserted behavior: login button label `Sign in`; forgot-password heading `Reset password`, button `Send reset email`, success text `Password reset email sent.`.

- [ ] **Step 1: Read current `forgot-password.tsx` and `_layout.tsx`** and keep their behavior/copy.

- [ ] **Step 2: Rewrite login**

`app/(auth)/login.tsx`:

```tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { signInWithPassword } from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading, supabase } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await signInWithPassword(supabase, email.trim(), password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Sign in</Text>
            <Text className="text-base font-sans text-neutral-600">
              Use the same Barberschedule account on Web, iOS, or Android.
            </Text>
            <Input label="Email" onChangeText={setEmail} testID="login-email" value={email} />
            <Input label="Password" onChangeText={setPassword} secureTextEntry testID="login-password" value={password} />
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
            <Button
              disabled={!email.trim() || !password || isLoading || isSubmitting}
              label="Sign in"
              onPress={handleSignIn}
              size="lg"
            />
            <Button label="Forgot password?" onPress={() => router.push("/forgot-password")} variant="ghost" />
            <Button label="Create account" onPress={() => router.push("/signup")} variant="outline" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Signup screen**

`app/(auth)/signup.tsx`:

```tsx
import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { colors } from "../../src/lib/design/colors";
import { signUpCustomer } from "../../src/features/auth/api";
import { parseSignupInput } from "../../src/features/auth/validation";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function SignupScreen() {
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const [form, setForm] = useState({ email: "", fullName: "", password: "", phone: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    const parsed = parseSignupInput({ ...form, acceptedTerms });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setServerError(null);
    setIsSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUpCustomer(supabase, parsed.value);
      setConfirmationSent(needsEmailConfirmation);
    } catch (caught) {
      setServerError(caught instanceof Error ? caught.message : "Unable to create your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <SafeAreaView className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <EmptyState title="Check your email" />
          <Text className="max-w-[420px] text-center text-base font-sans text-neutral-600">
            We sent a confirmation link to {form.email.trim().toLowerCase()}. Open it, then sign in.
          </Text>
          <Button label="Back to sign in" onPress={() => router.replace("/login")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Create account</Text>
            <Input error={errors.fullName} label="Full name" onChangeText={set("fullName")} testID="signup-name" value={form.fullName} />
            <Input error={errors.email} label="Email" onChangeText={set("email")} testID="signup-email" value={form.email} />
            <Input error={errors.phone} label="Phone (optional)" onChangeText={set("phone")} testID="signup-phone" value={form.phone} />
            <Input error={errors.password} label="Password" onChangeText={set("password")} secureTextEntry testID="signup-password" value={form.password} />
            <Pressable
              accessibilityLabel="I accept the terms and privacy policy"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              className="min-h-[44px] flex-row items-center gap-3"
              onPress={() => setAcceptedTerms((value) => !value)}
              testID="signup-accept-terms"
            >
              <View className={`h-6 w-6 items-center justify-center rounded-md border ${acceptedTerms ? "border-primary-400 bg-primary-400" : "border-neutral-300 bg-surface"}`}>
                {acceptedTerms ? <Check color={colors.ink} size={16} /> : null}
              </View>
              <Text className="flex-1 text-sm font-sans text-neutral-700">I accept the terms and privacy policy</Text>
            </Pressable>
            {errors.acceptedTerms ? <Text className="text-sm font-sans text-danger-500">{errors.acceptedTerms}</Text> : null}
            <Button label="Read terms and privacy policy" onPress={() => router.push("/legal")} size="sm" variant="ghost" />
            <Toast message={serverError ?? ""} onDismiss={() => setServerError(null)} variant="error" visible={serverError !== null} />
            <Button disabled={isSubmitting} label="Create account" onPress={submit} size="lg" />
            <Button label="I already have an account" onPress={() => router.replace("/login")} variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```
(`colors.ink` must exist; if the token is named differently use the design system's ink/dark token from `src/lib/design/colors.ts`.)

- [ ] **Step 4: Forgot password**: rewrite with `Input`/`Button`/`Toast`, keeping heading `Reset password`, `Input label="Email"`, button `Send reset email`, success text `Password reset email sent.` (show it as a success `Toast` variant; the e2e asserts the visible text).

- [ ] **Step 5: Legal screen**

`app/legal.tsx`:

```tsx
import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { Button } from "../src/components/ui/Button";
import { LEGAL_SECTIONS, TERMS_VERSION } from "../src/features/account/legal";

export default function LegalScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Terms and privacy</Text>
            <Text className="text-sm font-sans text-neutral-500">Version {TERMS_VERSION}</Text>
            {LEGAL_SECTIONS.map((section) => (
              <View className="gap-1" key={section.title}>
                <Text className="text-lg font-display-semibold text-ink">{section.title}</Text>
                <Text className="text-base font-sans text-neutral-700">{section.body}</Text>
              </View>
            ))}
            <Button label="Back" onPress={() => router.back()} variant="outline" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint`. Browser-check `/login`, `/signup` (validation errors, terms checkbox, "check your email" state via mocked route), `/forgot-password`, `/legal` at 320px and desktop widths.

```bash
git add app
git commit -m "feat: redesign auth screens, add signup and legal pages"
```

---

### Task 10: Agenda + reschedule screens

**Files:**
- Create: `app/(customer)/agenda.tsx`, `app/(customer)/reschedule.tsx`

**Interfaces:**
- Consumes: `groupByLocalDate`, `markAppointmentDays`, `pickInitialDate` (Task 7), `useAppointmentCards`, `listMyAppointments`, `cancelAppointment`, `rescheduleAppointment`, `isLifecycleWindowOpen`, `getAvailableSlotsQueryOptions`, `buildCalendarStripDays`, `CalendarStrip`, `TimeSlotPicker`.
- Route contract: agenda → `/reschedule?appointmentId&barberId&barberServiceId`.
- Test ids: `agenda-segment-upcoming`, `agenda-segment-history`, `appointment-card-<id>`, `appointment-reschedule-<id>`, `appointment-cancel-<id>`, `appointment-cancel-confirm-<id>`.

- [ ] **Step 1: Agenda screen**

`app/(customer)/agenda.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";
import { CalendarStrip } from "../../src/components/domain/CalendarStrip";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { groupByLocalDate, markAppointmentDays, pickInitialDate } from "../../src/features/appointments/agenda-view";
import { cancelAppointment, isLifecycleWindowOpen, listMyAppointments } from "../../src/features/appointments/lifecycle";
import type { Appointment } from "../../src/features/appointments/types";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const DAYS_AHEAD = 30;

export default function AgendaScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [segment, setSegment] = useState<"upcoming" | "history">("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const history = useQuery({ queryFn: () => listMyAppointments(supabase, true), queryKey: ["my-appointments", "history"] });
  const toCardProps = useAppointmentCards([...(upcoming.data ?? []), ...(history.data ?? [])]);

  const grouped = useMemo(() => groupByLocalDate(upcoming.data ?? []), [upcoming.data]);
  const days = useMemo(() => markAppointmentDays(buildCalendarStripDays(new Date(), DAYS_AHEAD), grouped), [grouped]);
  const selectedDate = pickedDate ?? pickInitialDate(days, grouped);
  const dayAppointments = grouped.get(selectedDate) ?? [];

  const cancel = useMutation({
    mutationFn: (appointmentId: string) => cancelAppointment(supabase, appointmentId),
    onError: (error) => setFeedback({ message: error instanceof Error ? error.message : "Unable to cancel.", variant: "error" }),
    onSuccess: () => {
      setConfirmingId(null);
      setSelectedId(null);
      setFeedback({ message: "Appointment cancelled.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    },
  });

  const renderAppointment = (appointment: Appointment, withActions: boolean) => {
    const open = isLifecycleWindowOpen(appointment.startsAt, new Date());

    return (
      <View className="gap-2" key={appointment.id}>
        <AppointmentCard
          {...toCardProps(appointment)}
          onPress={() => setSelectedId(selectedId === appointment.id ? null : appointment.id)}
          testID={`appointment-card-${appointment.id}`}
        />
        {withActions && selectedId === appointment.id ? (
          <View className="gap-2 px-1">
            {!open ? (
              <Text className="text-sm font-sans text-neutral-600">
                Changes are only allowed until 90 minutes before the start.
              </Text>
            ) : null}
            {confirmingId === appointment.id ? (
              <>
                <Button
                  disabled={cancel.isPending}
                  label="Confirm cancellation"
                  onPress={() => cancel.mutate(appointment.id)}
                  testID={`appointment-cancel-confirm-${appointment.id}`}
                  variant="danger"
                />
                <Button label="Keep appointment" onPress={() => setConfirmingId(null)} variant="ghost" />
              </>
            ) : (
              <>
                <Button
                  disabled={!open}
                  label="Reschedule"
                  onPress={() => router.push(
                    `/reschedule?appointmentId=${encodeURIComponent(appointment.id)}&barberId=${encodeURIComponent(appointment.barberId)}&barberServiceId=${encodeURIComponent(appointment.barberServiceId)}`,
                  )}
                  testID={`appointment-reschedule-${appointment.id}`}
                  variant="outline"
                />
                <Button
                  disabled={!open}
                  label="Cancel appointment"
                  onPress={() => setConfirmingId(appointment.id)}
                  testID={`appointment-cancel-${appointment.id}`}
                  variant="danger"
                />
              </>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const loading = segment === "upcoming" ? upcoming.isLoading : history.isLoading;
  const failed = segment === "upcoming" ? upcoming.error : history.error;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">Agenda</Text>
          <View className="w-full max-w-[420px] flex-row gap-2">
            <Button
              label="Upcoming"
              onPress={() => setSegment("upcoming")}
              size="sm"
              testID="agenda-segment-upcoming"
              variant={segment === "upcoming" ? "dark" : "outline"}
            />
            <Button
              label="History"
              onPress={() => setSegment("history")}
              size="sm"
              testID="agenda-segment-history"
              variant={segment === "history" ? "dark" : "outline"}
            />
          </View>
          {segment === "upcoming" ? (
            <View className="w-full">
              <CalendarStrip days={days} onSelectDate={setPickedDate} selectedDate={selectedDate} />
            </View>
          ) : null}
          <View className="w-full max-w-[420px] gap-3">
            {loading ? <SkeletonBlock height={120} width={320} /> : null}
            {failed ? <Text className="text-sm font-sans text-danger-500">Unable to load appointments.</Text> : null}
            {!loading && !failed && segment === "upcoming" && dayAppointments.length === 0 ? (
              <EmptyState title="No appointments this day" />
            ) : null}
            {!loading && !failed && segment === "history" && (history.data?.length ?? 0) === 0 ? (
              <EmptyState title="No past appointments yet" />
            ) : null}
            {segment === "upcoming"
              ? dayAppointments.map((appointment) => renderAppointment(appointment, true))
              : (history.data ?? []).map((appointment) => renderAppointment(appointment, false))}
          </View>
          <Toast
            message={feedback?.message ?? ""}
            onDismiss={() => setFeedback(null)}
            variant={feedback?.variant ?? "info"}
            visible={feedback !== null}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Reschedule screen**

`app/(customer)/reschedule.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { CalendarStrip } from "../../src/components/domain/CalendarStrip";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { getAvailableSlotsQueryOptions } from "../../src/features/availability/query";
import type { AvailableSlot } from "../../src/features/availability/types";
import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const DAYS_AHEAD = 14;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function RescheduleScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string; barberId?: string; barberServiceId?: string }>();
  const appointmentId = param(params.appointmentId);
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const days = useMemo(() => buildCalendarStripDays(new Date(), DAYS_AHEAD), []);
  const [localDate, setLocalDate] = useState(days[0].date);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({
    status: slot.startsAt === startsAt ? "selected" : "free",
    time: slot.localTime,
  }));

  const reschedule = useMutation({
    mutationFn: (newStartsAt: string) => rescheduleAppointment(supabase, appointmentId, newStartsAt),
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Unable to reschedule."),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      router.replace("/agenda");
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">Reschedule</Text>
          <View className="w-full">
            <CalendarStrip
              days={days}
              onSelectDate={(date) => { setLocalDate(date); setStartsAt(null); }}
              selectedDate={localDate}
            />
          </View>
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? <SkeletonBlock height={56} width={320} /> : null}
            {availability.error ? <Text className="text-sm font-sans text-danger-500">Unable to load availability.</Text> : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title="No times available this day" /> : null}
            {slots.length > 0 ? (
              <TimeSlotPicker
                onSelectSlot={(time) => setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null)}
                slots={slots}
              />
            ) : null}
          </View>
          <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          <View className="w-full max-w-[420px] gap-2">
            <Button
              disabled={!startsAt || reschedule.isPending}
              label="Confirm new time"
              onPress={() => startsAt && reschedule.mutate(startsAt)}
              size="lg"
              testID="reschedule-confirm"
            />
            <Button label="Keep current time" onPress={() => router.back()} variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand`. Browser-check with a mocked session (Task 12's helper) that: strip dots mark days, tapping a card reveals actions, cancel needs a confirmation tap, reschedule lands back on `/agenda`, actions are disabled with the note inside the 90-minute cutoff.

```bash
git add app
git commit -m "feat: add customer agenda with calendar strip, cancel and reschedule flow"
```

---

### Task 11: Profile screen (edit, export, delete)

**Files:**
- Create: `src/features/account/export-file.ts`
- Rewrite: `app/(customer)/profile.tsx`
- Test: `tests/unit/export-file.test.ts`

**Interfaces:**
- Consumes: `updateMyProfile`, `exportMyData`, `buildExportFile`, `deleteMyAccount`, `listMyCustomers`.
- Produces: `saveExportFile(file: { content: string; filename: string; mimeType: string }): Promise<void>` — web: Blob download via a temporary anchor; native: `Share.share({ message: content, title: filename })`.
- Test ids: `profile-name`, `profile-phone`, `profile-save`, `profile-export`, `profile-delete`, `profile-delete-confirm`.

- [ ] **Step 1: Write the failing test**

`tests/unit/export-file.test.ts`:

```ts
import { Platform, Share } from "react-native";

import { saveExportFile } from "../../src/features/account/export-file";

const file = { content: "{}", filename: "data.json", mimeType: "application/json" };

describe("saveExportFile", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shares the JSON text on native platforms", async () => {
    Platform.OS = "ios";
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);

    await saveExportFile(file);

    expect(share).toHaveBeenCalledWith({ message: "{}", title: "data.json" });
  });

  it("downloads a Blob through an anchor on web", async () => {
    Platform.OS = "web";
    const click = jest.fn();
    const anchor = { click } as unknown as HTMLAnchorElement;
    (globalThis as { document?: unknown }).document = { createElement: jest.fn(() => anchor) };
    (globalThis as { URL: unknown }).URL = { createObjectURL: jest.fn(() => "blob:1"), revokeObjectURL: jest.fn() };

    await saveExportFile(file);

    expect(anchor.download).toBe("data.json");
    expect(anchor.href).toBe("blob:1");
    expect(click).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --runInBand tests/unit/export-file.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `saveExportFile`**

```ts
import { Platform, Share } from "react-native";

type ExportFile = { content: string; filename: string; mimeType: string };

export async function saveExportFile(file: ExportFile) {
  if (Platform.OS !== "web") {
    await Share.share({ message: file.content, title: file.filename });
    return;
  }

  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```
Run the test again → PASS. (In the Jest env `Blob` exists in Node; if `tsc` lacks DOM types, add `"lib": ["dom", ...]` awareness via the existing tsconfig — check `npm run typecheck`.)

- [ ] **Step 4: Profile screen**

`app/(customer)/profile.tsx`:

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { buildExportFile, deleteMyAccount, exportMyData, updateMyProfile } from "../../src/features/account/api";
import { saveExportFile } from "../../src/features/account/export-file";
import { signOut } from "../../src/features/auth/api";
import { listMyCustomers } from "../../src/features/customers/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, supabase } = useSupabaseSession();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const customer = customers.data?.[0];
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const fail = (caught: unknown, fallback: string) =>
    setFeedback({ message: caught instanceof Error ? caught.message : fallback, variant: "error" });

  useEffect(() => {
    if (customer) {
      setFullName(customer.fullName);
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: () => updateMyProfile(supabase, { fullName, phone: phone.trim() || null }),
    onError: (caught) => fail(caught, "Unable to save your profile."),
    onSuccess: () => {
      setFeedback({ message: "Profile saved.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-customers"] });
    },
  });
  const exportData = useMutation({
    mutationFn: async () => saveExportFile(buildExportFile(await exportMyData(supabase))),
    onError: (caught) => fail(caught, "Unable to export your data."),
    onSuccess: () => setFeedback({ message: "Your data export is ready.", variant: "success" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await deleteMyAccount(supabase);
      await supabase.auth.signOut().catch(() => undefined);
    },
    onError: (caught) => { setConfirmingDelete(false); fail(caught, "Unable to delete your account."); },
  });

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Profile</Text>
            <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
            <Input label="Full name" onChangeText={setFullName} testID="profile-name" value={fullName} />
            <Input label="Phone (optional)" onChangeText={setPhone} testID="profile-phone" value={phone} />
            <Button disabled={save.isPending || !customer} label="Save changes" onPress={() => save.mutate()} testID="profile-save" />

            <Text className="pt-2 text-lg font-display-semibold text-ink">Your data</Text>
            <Button label="Download my data" onPress={() => exportData.mutate()} testID="profile-export" variant="outline" disabled={exportData.isPending} />
            <Button label="Terms and privacy policy" onPress={() => router.push("/legal")} variant="ghost" />

            {confirmingDelete ? (
              <View className="gap-2">
                <Text className="text-base font-sans text-neutral-700">
                  This deletes your login and anonymizes your customer record. Past appointments stay in the shop's records without your name, phone or email. This cannot be undone.
                </Text>
                <Button disabled={remove.isPending} label="Yes, delete my account" onPress={() => remove.mutate()} testID="profile-delete-confirm" variant="danger" />
                <Button label="Keep my account" onPress={() => setConfirmingDelete(false)} variant="ghost" />
              </View>
            ) : (
              <Button label="Delete my account" onPress={() => setConfirmingDelete(true)} testID="profile-delete" variant="outline" />
            )}

            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
            <Button label="Sign out" onPress={async () => { try { await signOut(supabase); } catch (caught) { fail(caught, "Unable to sign out."); } }} variant="dark" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test -- --runInBand`. Browser-check edit/save, export download, delete-blocked message (mock a 409 from `**/functions/v1/delete-account`).

```bash
git add src/features/account/export-file.ts tests/unit/export-file.test.ts "app/(customer)/profile.tsx"
git commit -m "feat: customer profile with edit, data export and account deletion"
```

---

### Task 12: e2e updates, docs, spec amendments, full gate

**Files:**
- Create: `tests/e2e/customer-helpers.ts`
- Modify: `tests/e2e/auth.web.spec.ts`, `tests/e2e/booking.web.spec.ts`, `tests/e2e/customer-lifecycle.web.spec.ts`; check `tests/e2e/smoke.spec.ts` and `schedule.spec.ts` for anything touching `/`, `/login`, `/profile`, `/appointments`, `/history`, or `(public)`.
- Modify: `docs/project-status.md`, `DESIGN_SYSTEM.md` (§12.9 note), `docs/superpowers/specs/2026-09-23-customer-frontend-design.md` (spec deltas), create `docs/decisions/011-customer-self-service-and-lgpd.md`.

**Interfaces:**
- Produces `tests/e2e/customer-helpers.ts`:
  - `signInAsCustomer(page: Page, userId: string): Promise<void>` (the `addInitScript` block used by existing specs)
  - `json(route: Route, body: unknown, status?: number): Promise<void>`
  - `customerRow(userId: string)`, `appointmentRow(overrides)` factories.

- [ ] **Step 1: Inventory existing e2e assertions (do this before editing)**

Run: `grep -n "getByText\|getByRole\|getByPlaceholder\|goto" tests/e2e/*.spec.ts` and write down every assertion touching a screen rewritten in Tasks 8–11. For each: keep it, or change it deliberately and list the change in the commit body. Known changes:
- auth: `getByPlaceholder("Email"/"Password")` → `getByLabel("Email"/"Password")`; post-login `Signed in as customer.` + link `Book an appointment` → heading `Hi, Browser Customer`/`Welcome` on `/home` (the owner test is unchanged — owner hub was not touched).
- booking: every customer route now needs `**/rpc/ensure_my_customer` mocked (return the customer row); `/book` with one shop **auto-skips** the shop picker — remove the `Start booking at Browser Shop` click; date step and slot buttons now use the design-system screens from the previous cycle (already reflected in the spec).
- customer-lifecycle: `/profile` heading `My profile` → `Profile`; `/appointments`+`/history` cases become `/agenda` (Upcoming/History segments); the ISO-text reschedule is replaced by the picker.

- [ ] **Step 2: Helpers**

`tests/e2e/customer-helpers.ts`:

```ts
import type { Page, Route } from "@playwright/test";

export async function signInAsCustomer(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({
      access_token: token, expires_at: now + 3600, expires_in: 3600,
      refresh_token: "e2e-refresh-token", token_type: "bearer", user: { email: "customer@example.com", id },
    });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
}

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}

export function customerRow(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    active: true, archived_at: null, email: "customer@example.com", full_name: "Browser Customer",
    id: "44444444-4444-4444-8444-444444444444", phone: null,
    shop_id: "11111111-1111-4111-8111-111111111111", user_id: userId, ...overrides,
  };
}

export function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    barber_buffer_minutes_snapshot: 0, barber_id: "22222222-2222-4222-8222-222222222222",
    barber_service_id: "33333333-3333-4333-8333-333333333333", created_at: "2026-08-13T10:00:00Z",
    customer_id: "44444444-4444-4444-8444-444444444444", ends_at: "2099-01-05T12:30:00Z",
    id: "appointment-upcoming", notes: null, occupied_until: "2099-01-05T12:30:00Z",
    service_duration_minutes_snapshot: 30, service_id: "service-1", service_name_snapshot: "Browser Cut",
    service_price_cents_snapshot: 4000, shop_id: "11111111-1111-4111-8111-111111111111", source: "customer",
    starts_at: "2099-01-05T12:00:00Z", status: "scheduled", updated_at: "2026-08-13T10:00:00Z", ...overrides,
  };
}
```
(Far-future dates keep the 90-minute window open and the appointment inside no fixed strip — for agenda tests use a start within the next 30 days computed in the test: `new Date(Date.now() + 5 * 864e5).toISOString()`.)

- [ ] **Step 3: Write/adjust the specs**

Add these tests (each mocks `/rest/v1/**` via a single `page.route` switch on `url.pathname`, includes `get_current_profile`, `ensure_my_customer`, `customers`, plus what it needs, and aborts anything else):

1. **auth — signup:** fill `Full name`, `Email`, `Password`, tick `I accept the terms and privacy policy`, click `Create account`; mock `**/auth/v1/signup` returning `{ id: "new-user", email }` without a session; assert payload `data.accepted_terms_version` is `2026-09-23` and `data.full_name`; expect text `Check your email`. Also: submitting without the checkbox shows `Accept the terms and privacy policy to continue.` and sends no request.
2. **agenda — calendar & cancel:** one upcoming appointment ~5 days out; open `/agenda`; expect `getByTestId("appointment-card-appointment-upcoming")`; click it; click `Cancel appointment`; click `Confirm cancellation`; assert the mocked `**/rpc/cancel_appointment` received `appointment_id`; expect `Appointment cancelled.`
3. **agenda — cutoff:** appointment starting in 30 minutes; click card; expect `Changes are only allowed until 90 minutes before the start.` and `Reschedule`/`Cancel appointment` disabled.
4. **agenda — history segment:** click `History`; mock `appointments` to return a `completed` row for the history query (distinguish by `status=in.(cancelled,completed,no_show)` in `url.search`); expect its card.
5. **reschedule:** from `/agenda` click card → `Reschedule`; mock `**/rpc/get_available_slots` with one slot `local_time: "10:00:00"`; pick it; click `Confirm new time`; assert `**/rpc/reschedule_appointment` payload `new_starts_at`; expect URL `/agenda`.
6. **profile — edit:** `/profile` prefilled from `customers`; change name; `Save changes`; assert `**/rpc/update_my_profile` payload `{ p_full_name, p_phone }`; expect `Profile saved.`
7. **profile — export:** `page.waitForEvent("download")` around clicking `Download my data`; mock `**/rpc/export_my_data`; assert `download.suggestedFilename()` matches `/^barberschedule-my-data-\d{4}-\d{2}-\d{2}\.json$/`.
8. **profile — delete blocked:** click `Delete my account` → `Yes, delete my account`; mock `**/functions/v1/delete-account` → 409 `{ code: "ACCOUNT_DELETION_BLOCKED" }`; expect text starting `Cancel your upcoming appointments`.
9. **legal:** signed-out `/legal` renders heading `Terms and privacy` (no redirect).
10. **role guard:** an owner session visiting `/home` ends up on `/` (owner hub link `Manage agenda` visible).

Update the existing auth/booking/lifecycle tests per Step 1.

- [ ] **Step 4: Run e2e and iterate**

Run: `npm run test:e2e:web`
Expected: all specs PASS. Fix screens (not tests) when a failure reveals a real defect; adjust tests only for intentional copy/route changes recorded in Step 1.

- [ ] **Step 5: Docs and spec amendments**

- `docs/decisions/011-customer-self-service-and-lgpd.md`: context (new account could not book), decisions (`ensure_my_customer` reads signup metadata; consent RPC-only; anonymize-on-delete with retention rationale LGPD art. 16 I; deletion blocked with upcoming appointments/active series; known limitation: `appointments.notes` are retained as written — instruct future work to redact on request), and the open items (legal text needs owner/counsel review; email-confirmation setting per environment; Edge Function needs `SUPABASE_SERVICE_ROLE_KEY`).
- `docs/project-status.md`: add "Task 14 — customer frontend" with verification evidence (paste the real command outputs from Step 6) and known limitations (no Deno test for the Edge Function; e2e mock Supabase REST).
- `DESIGN_SYSTEM.md` §12.9: note customer tabs are Home/Book/Agenda/Profile.
- Spec: apply the four "Spec deltas" listed at the top of this plan.

- [ ] **Step 6: Full gate**

Run, and paste real output into `docs/project-status.md`:
```bash
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npx supabase db reset --local
HOME=/tmp SUPABASE_DISABLE_TELEMETRY=1 npm run verify
npm run test:e2e:web
npm run export:web
```
Expected: typecheck/lint clean; Jest all green (167 baseline + new); pgTAP green except the known `010_full_rls.sql` mismatch; e2e all green; static export succeeds. If local Supabase cannot run here, say so explicitly in the report — do not claim DB verification.

- [ ] **Step 7: Code review, then commit**

Invoke the `requesting-code-review` skill on the branch diff against `main`; fix Critical/Important findings with new commits.

```bash
git add tests docs DESIGN_SYSTEM.md
git commit -m "test: customer e2e coverage; docs: decision record and status for customer frontend"
```

---

## Self-Review

**Spec coverage**
- Signup + login/reset redesign → Tasks 4, 9. Consent at signup → Tasks 1 (`ensure_my_customer` consents), 4 (metadata), 9 (checkbox).
- Customer row bootstrap (`ensure_my_customer`) → Tasks 1, 2, 8 (layout gate).
- `update_my_profile`, `export_my_data`, deletion (`prepare_account_deletion` + Edge Function) → Tasks 1, 2, 3, 11.
- Tabs / `BottomTabBar` / role guard table → Tasks 5, 6, 8. `(public)` removed → Task 8. Shop picker skipped → Task 8.
- Home, Agenda (strip, segments, cancel, reschedule w/ 90-min mirror), Profile, Legal → Tasks 8–11.
- LGPD mapping (consent, minimization, portability, erasure, transparency) → Tasks 1, 4, 9, 11.
- e2e + docs + gate + review → Task 12. Owner/barber out of scope; owner hub untouched (verified by e2e #10).

**Placeholder scan:** no TBD/TODO. Two deliberate adapt-to-installed-API notes (zod 4 minor, `colors.*` token names) and one fixture note (lifecycle trigger on direct status update) are flagged with the test as the contract.

**Type consistency:** `ensureMyCustomer/updateMyProfile/exportMyData/buildExportFile/deleteMyAccount` (Task 2) match usages in Tasks 8 and 11; `SignupInput`/`parseSignupInput`/`signUpCustomer` (Task 4) match Task 9; `groupByLocalDate/markAppointmentDays/pickInitialDate/formatAppointmentLabels/useAppointmentCards` (Task 7) match Tasks 8, 10; `BottomTabItem`/`BottomTabBar` (Task 6) match Task 8; query keys `["my-customers"]`, `["my-appointments", "upcoming"|"history"]`, `["public-shops"]`, `["public-barbers", shopId]`, `["ensure-my-customer", userId]` are used consistently.
