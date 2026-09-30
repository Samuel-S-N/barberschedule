# Customer Profile Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the customer Profile tab into a hub (round avatar + blocks of menu rows) with inner screens for account data, security, settings, privacy and about, including photo upload and an e-mail sync trigger.

**Architecture:** One DB migration (avatar column, `avatars` bucket + policies, `set_my_avatar` RPC, `auth.users` e-mail sync trigger). Pure helpers and API functions under `src/features/account`, three new presentational components (`Avatar`, `MenuBlock`, `ScreenHeader`), and five new stack routes under `app/(customer)/me/`.

**Tech Stack:** Expo 57, expo-router, NativeWind, react-query, Supabase (Postgres/Storage/Auth), `expo-image-picker`, jest-expo, pgTAP, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-customer-profile-design.md`

## Global Constraints

- Customer role only; owner/barber screens are untouched.
- Light theme tokens from `DESIGN_SYSTEM.md`; no `#hex` in JSX (import `colors` from `src/lib/design/colors.ts` for icon colors).
- `className` only on plain RN elements (View/Text/Pressable/Image), never on wrapper components; dynamic sizes via `style`.
- All visible strings via i18n in **pt, en, es** (`locale-parity` and `no-hardcoded-text` tests enforce it).
- Fonts: use `font-sans-medium` / `font-display-bold` style classes, never `font-medium`/`font-bold`.
- Hit targets ≥ 44px.
- Avatar: jpeg/png/webp, ≤ 2 MB (client validation and bucket limit), stored at `<uid>/avatar-<timestamp>.<ext>` in bucket `avatars`.
- Routes live in `app/(customer)/me/*` (a bare `/settings` would collide with `(owner)/settings.tsx`; `route-collisions.test.ts` enforces this).
- Run shell commands through `rtk`. Commit after each task with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Local Supabase is already running (Docker). DB tests: `npx supabase test db`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0027_customer_profile.sql` | avatar column, bucket, storage policies, `set_my_avatar`, e-mail sync trigger |
| `supabase/tests/014_customer_profile.sql` | pgTAP for all of the above |
| `src/features/account/avatar.ts` | pure avatar helpers (initial, validation, paths) |
| `src/features/account/security.ts` | pure e-mail/password validation |
| `src/features/account/api.ts` (modify) | `uploadMyAvatar`, `changePassword`, `changeEmail` |
| `src/features/account/use-my-profile.ts` | react-query hook for the current profile (with `avatarUrl`) |
| `src/features/auth/types.ts`, `api.ts` (modify) | `Profile.avatarUrl` |
| `src/lib/supabase/client.ts` (modify) | `createPasswordCheckClient()` (throwaway client) |
| `src/lib/navigation/use-back.ts` | back that falls back to the profile tab |
| `src/components/domain/Avatar.tsx`, `MenuBlock.tsx`, `ScreenHeader.tsx` | presentational components |
| `src/i18n/locales/{pt,en,es}.ts` (modify) | new copy |
| `app/(customer)/(tabs)/profile.tsx` (rewrite) | the hub |
| `app/(customer)/me/{account,security,settings,privacy,about}.tsx` | inner screens |
| `app/(customer)/_layout.tsx` (modify) | register the stack screens |
| `supabase/functions/delete-account/index.ts` (modify) | remove the user's avatar folder |

---

### Task 1: Migration and pgTAP

**Files:**
- Create: `supabase/migrations/0027_customer_profile.sql`
- Test: `supabase/tests/014_customer_profile.sql`

**Interfaces:**
- Produces: column `profiles.avatar_url text`; RPC `public.set_my_avatar(p_url text) returns public.profiles` (errcode `P0017` on invalid, `42501` for anon); bucket `avatars`; trigger syncing `customers.email` from `auth.users.email`.

- [ ] **Step 1: Write the failing pgTAP test** — `supabase/tests/014_customer_profile.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't14-owner@example.com', 'password-hash', now(), '{"full_name":"T14 Owner"}'),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't14-customer@example.com', 'password-hash', now(), '{"full_name":"T14 Customer"}'),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't14-other@example.com', 'password-hash', now(), '{"full_name":"T14 Other"}');

update public.profiles set role = 'owner' where user_id = '80000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id)
values ('81000000-0000-0000-0000-000000000001', 'T14 Shop', '80000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.ensure_my_customer();

select is(
  (select avatar_url from public.set_my_avatar('http://127.0.0.1:54321/storage/v1/object/public/avatars/80000000-0000-0000-0000-000000000002/avatar-1.jpg')),
  'http://127.0.0.1:54321/storage/v1/object/public/avatars/80000000-0000-0000-0000-000000000002/avatar-1.jpg',
  'set_my_avatar stores a url inside the caller''s own folder');
select is(
  (select avatar_url from public.get_current_profile()),
  'http://127.0.0.1:54321/storage/v1/object/public/avatars/80000000-0000-0000-0000-000000000002/avatar-1.jpg',
  'get_current_profile returns avatar_url');
select throws_ok(
  $$ select public.set_my_avatar('http://127.0.0.1:54321/storage/v1/object/public/avatars/80000000-0000-0000-0000-000000000003/avatar-1.jpg') $$,
  'P0017', null, 'a url in another user''s folder is rejected');
select throws_ok($$ select public.set_my_avatar('not a url') $$, 'P0017', null, 'a non-url is rejected');
select is((select avatar_url from public.set_my_avatar(null)), null, 'null clears the avatar');

-- storage policies
select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '80000000-0000-0000-0000-000000000002/avatar-2.jpg') $$,
  'a user can upload into their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '80000000-0000-0000-0000-000000000003/avatar-2.jpg') $$,
  '42501', null, 'a user cannot upload into another user''s folder');

-- anon
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok($$ select public.set_my_avatar(null) $$, '42501', null, 'anonymous callers cannot set an avatar');

-- e-mail sync
reset role;
update auth.users set email = 't14-renamed@example.com' where id = '80000000-0000-0000-0000-000000000002';
select is((select email from public.customers where user_id = '80000000-0000-0000-0000-000000000002'), 't14-renamed@example.com', 'changing the login e-mail syncs customers.email');
update auth.users set raw_user_meta_data = '{"full_name":"T14 Customer"}' where id = '80000000-0000-0000-0000-000000000002';
select is((select email from public.customers where user_id = '80000000-0000-0000-0000-000000000002'), 't14-renamed@example.com', 'unrelated auth updates leave customers.email alone');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk npx supabase test db`
Expected: FAIL in `014_customer_profile.sql` (`set_my_avatar` does not exist).

- [ ] **Step 3: Write the migration** — `supabase/migrations/0027_customer_profile.sql`

```sql
alter table public.profiles add column avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create function public.set_my_avatar(p_url text)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  clean text := nullif(btrim(p_url), '');
  result public.profiles;
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;
  if clean is not null and (
    clean !~* '^https?://[^\s]+$'
    or position('/storage/v1/object/public/avatars/' || actor::text || '/' in clean) = 0
  ) then
    raise exception using errcode = 'P0017', message = 'PROFILE_INVALID';
  end if;

  update public.profiles
  set avatar_url = clean, updated_at = clock_timestamp()
  where user_id = actor
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_my_avatar(text) from public;
grant execute on function public.set_my_avatar(text) to authenticated;

create function public.sync_customer_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.customers
  set email = new.email, updated_at = clock_timestamp()
  where user_id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_customer_email();
```

- [ ] **Step 4: Apply and run to verify it passes**

Run: `rtk npx supabase db reset && rtk npx supabase test db`
Expected: all files PASS, including `014_customer_profile.sql` (10 tests). If the "unrelated auth updates" test needs the trigger's `when` clause: it is already there.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0027_customer_profile.sql supabase/tests/014_customer_profile.sql
git commit -m "feat(db): avatar column, avatars bucket, set_my_avatar and e-mail sync trigger

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Avatar helpers, upload API, Profile.avatarUrl

**Files:**
- Create: `src/features/account/avatar.ts`, `src/features/account/use-my-profile.ts`, `tests/unit/avatar.test.ts`
- Modify: `src/features/account/api.ts`, `src/features/auth/types.ts`, `src/features/auth/api.ts`, `tests/integration/account.test.ts`

**Interfaces:**
- Produces (`avatar.ts`): `AVATAR_BUCKET = "avatars"`, `AVATAR_MAX_BYTES`, `avatarInitial(name?: string | null): string`, `validateAvatar(file: { size: number; type: string }): "type" | "size" | null`, `avatarPath(userId: string, mimeType: string, now?: number): string`, `avatarPathFromUrl(url: string, userId: string): string | null`.
- Produces (`api.ts`): `uploadMyAvatar(supabase: Pick<SupabaseClient, "rpc" | "storage">, userId: string, blob: Blob, previousUrl: string | null): Promise<string>` (returns the new public url).
- Produces: `Profile.avatarUrl?: string | null`; `useMyProfile()` returning the react-query result of `getCurrentProfile`.

- [ ] **Step 1: Write the failing unit test** — `tests/unit/avatar.test.ts`

```ts
import {
  AVATAR_MAX_BYTES, avatarInitial, avatarPath, avatarPathFromUrl, validateAvatar,
} from "../../src/features/account/avatar";

describe("avatar helpers", () => {
  it("uses the uppercased first letter of the name, or ? when empty", () => {
    expect(avatarInitial("  samuel neres")).toBe("S");
    expect(avatarInitial("")).toBe("?");
    expect(avatarInitial(null)).toBe("?");
  });

  it("accepts jpeg, png and webp up to the limit", () => {
    expect(validateAvatar({ size: 1000, type: "image/jpeg" })).toBeNull();
    expect(validateAvatar({ size: AVATAR_MAX_BYTES, type: "image/png" })).toBeNull();
    expect(validateAvatar({ size: 1000, type: "image/webp" })).toBeNull();
  });

  it("rejects other types and oversized files", () => {
    expect(validateAvatar({ size: 1000, type: "image/gif" })).toBe("type");
    expect(validateAvatar({ size: AVATAR_MAX_BYTES + 1, type: "image/jpeg" })).toBe("size");
  });

  it("builds a path in the user's folder with the right extension", () => {
    expect(avatarPath("u1", "image/jpeg", 5)).toBe("u1/avatar-5.jpg");
    expect(avatarPath("u1", "image/png", 5)).toBe("u1/avatar-5.png");
    expect(avatarPath("u1", "image/webp", 5)).toBe("u1/avatar-5.webp");
  });

  it("extracts the object path from a public url, only for the same user", () => {
    const url = "http://x/storage/v1/object/public/avatars/u1/avatar-5.jpg";

    expect(avatarPathFromUrl(url, "u1")).toBe("u1/avatar-5.jpg");
    expect(avatarPathFromUrl(url, "u2")).toBeNull();
    expect(avatarPathFromUrl("http://elsewhere/pic.jpg", "u1")).toBeNull();
  });
});
```

And append to `tests/integration/account.test.ts` (inside the existing `describe("account api", ...)`; add `uploadMyAvatar` to the import):

```ts
  it("uploadMyAvatar uploads, saves the url and removes the previous file", async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: "http://x/storage/v1/object/public/avatars/u1/avatar-9.jpg" } });
    const rpc = jest.fn().mockResolvedValue({ data: {}, error: null });
    const supabase = { rpc, storage: { from: jest.fn().mockReturnValue({ getPublicUrl, remove, upload }) } };
    const blob = new Blob(["x"], { type: "image/jpeg" });

    const url = await uploadMyAvatar(supabase as never, "u1", blob, "http://x/storage/v1/object/public/avatars/u1/avatar-1.jpg");

    expect(url).toBe("http://x/storage/v1/object/public/avatars/u1/avatar-9.jpg");
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^u1\/avatar-\d+\.jpg$/), blob, { contentType: "image/jpeg" });
    expect(rpc).toHaveBeenCalledWith("set_my_avatar", { p_url: url });
    expect(remove).toHaveBeenCalledWith(["u1/avatar-1.jpg"]);
  });

  it("uploadMyAvatar removes the new file when saving the url fails", async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const supabase = {
      rpc: jest.fn().mockResolvedValue({ data: null, error: { code: "XX000" } }),
      storage: { from: jest.fn().mockReturnValue({
        getPublicUrl: () => ({ data: { publicUrl: "http://x/storage/v1/object/public/avatars/u1/avatar-9.jpg" } }),
        remove, upload: jest.fn().mockResolvedValue({ error: null }),
      }) },
    };

    await expect(uploadMyAvatar(supabase as never, "u1", new Blob(["x"], { type: "image/png" }), null))
      .rejects.toMatchObject({ code: "ACCOUNT_REQUEST_FAILED" });
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^u1\/avatar-\d+\.png$/)]);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk npx jest tests/unit/avatar.test.ts tests/integration/account.test.ts`
Expected: FAIL (modules/exports missing).

- [ ] **Step 3: Implement**

`src/features/account/avatar.ts`:

```ts
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function avatarInitial(name?: string | null) {
  return (name?.trim()[0] ?? "?").toUpperCase();
}

export function validateAvatar(file: { size: number; type: string }) {
  if (!(file.type in EXTENSIONS)) return "type" as const;
  if (file.size > AVATAR_MAX_BYTES) return "size" as const;

  return null;
}

export function avatarPath(userId: string, mimeType: string, now = Date.now()) {
  return `${userId}/avatar-${now}.${EXTENSIONS[mimeType] ?? "jpg"}`;
}

export function avatarPathFromUrl(url: string, userId: string) {
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  const path = index === -1 ? "" : url.slice(index + marker.length);

  return path.startsWith(`${userId}/`) ? path : null;
}
```

In `src/features/account/api.ts` add imports `import { AVATAR_BUCKET, avatarPath, avatarPathFromUrl } from "./avatar";` and:

```ts
export async function uploadMyAvatar(
  supabase: Pick<SupabaseClient, "rpc" | "storage">,
  userId: string,
  blob: Blob,
  previousUrl: string | null,
) {
  const bucket = supabase.storage.from(AVATAR_BUCKET);
  const path = avatarPath(userId, blob.type);
  const { error } = await bucket.upload(path, blob, { contentType: blob.type });

  if (error) {
    throw new DomainError("ACCOUNT_REQUEST_FAILED", "Something went wrong. Please try again.");
  }

  const { publicUrl } = bucket.getPublicUrl(path).data;

  try {
    await callRpc(supabase, "set_my_avatar", { p_url: publicUrl });
  } catch (caught) {
    await bucket.remove([path]).catch(() => undefined);
    throw caught;
  }

  const previous = previousUrl ? avatarPathFromUrl(previousUrl, userId) : null;

  if (previous) {
    await bucket.remove([previous]).catch(() => undefined); // ponytail: orphaned file if this fails; a cleanup job if it ever matters
  }

  return publicUrl;
}
```

`src/features/auth/types.ts`: add `avatarUrl?: string | null;` to `Profile`.
`src/features/auth/api.ts`: `CurrentProfileRow` gets `avatar_url?: string | null;` and `toProfile` adds `...(typeof row.avatar_url !== "undefined" ? { avatarUrl: row.avatar_url } : {}),`.

`src/features/account/use-my-profile.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { getCurrentProfile } from "../auth/api";

export function useMyProfile() {
  const { session, supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(session),
    queryFn: () => getCurrentProfile(supabase),
    queryKey: ["my-profile", session?.user.id],
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `rtk npx jest tests/unit/avatar.test.ts tests/integration/account.test.ts tests/integration/auth.test.ts && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(account): avatar helpers, upload API and Profile.avatarUrl

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Password and e-mail change

**Files:**
- Create: `src/features/account/security.ts`, `tests/unit/security.test.ts`
- Modify: `src/features/account/api.ts`, `src/lib/supabase/client.ts`, `tests/integration/account.test.ts`

**Interfaces:**
- Produces (`security.ts`): `isValidEmail(value: string): boolean`; `validateNewPassword(next: string, confirm: string): "password" | "mismatch" | null` (`"password"` when shorter than 8, matching the signup rule).
- Produces (`api.ts`): `changePassword(supabase: Pick<SupabaseClient, "auth">, verifier: Pick<SupabaseClient, "auth">, email: string, current: string, next: string): Promise<"ok" | "wrong-password">`; `changeEmail(supabase: Pick<SupabaseClient, "auth">, email: string): Promise<void>`.
- Produces (`client.ts`): `createPasswordCheckClient(): SupabaseClient` — no persistence, own `storageKey`, so signing in with it never fires the main client's auth events (the root layout blocks on `isLoading`).

- [ ] **Step 1: Write the failing tests** — `tests/unit/security.test.ts`

```ts
import { isValidEmail, validateNewPassword } from "../../src/features/account/security";

describe("security validation", () => {
  it("validates e-mails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail(" a@b.co ")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });

  it("requires 8+ characters and a matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toBe("password");
    expect(validateNewPassword("longenough", "different1")).toBe("mismatch");
    expect(validateNewPassword("longenough", "longenough")).toBeNull();
  });
});
```

Append to `tests/integration/account.test.ts` (import `changeEmail`, `changePassword`):

```ts
  it("changePassword verifies the current password on a separate client, then updates", async () => {
    const verifier = { auth: { signInWithPassword: jest.fn().mockResolvedValue({ error: null }), signOut: jest.fn().mockResolvedValue({ error: null }) } };
    const updateUser = jest.fn().mockResolvedValue({ error: null });

    await expect(changePassword({ auth: { updateUser } } as never, verifier as never, "a@b.co", "old-pass-1", "new-pass-1"))
      .resolves.toBe("ok");
    expect(verifier.auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "old-pass-1" });
    expect(updateUser).toHaveBeenCalledWith({ password: "new-pass-1" });
  });

  it("changePassword reports a wrong current password without updating", async () => {
    const verifier = { auth: { signInWithPassword: jest.fn().mockResolvedValue({ error: { code: "invalid_credentials" } }), signOut: jest.fn() } };
    const updateUser = jest.fn();

    await expect(changePassword({ auth: { updateUser } } as never, verifier as never, "a@b.co", "bad", "new-pass-1"))
      .resolves.toBe("wrong-password");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("changePassword surfaces other failures", async () => {
    const verifier = { auth: { signInWithPassword: jest.fn().mockResolvedValue({ error: { code: "over_request_rate_limit" } }), signOut: jest.fn() } };

    await expect(changePassword({ auth: { updateUser: jest.fn() } } as never, verifier as never, "a@b.co", "x", "new-pass-1"))
      .rejects.toMatchObject({ code: "ACCOUNT_REQUEST_FAILED" });
  });

  it("changeEmail asks Supabase to send a confirmation link", async () => {
    const updateUser = jest.fn().mockResolvedValue({ error: null });

    await expect(changeEmail({ auth: { updateUser } } as never, " new@b.co ")).resolves.toBeUndefined();
    expect(updateUser).toHaveBeenCalledWith({ email: "new@b.co" });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `rtk npx jest tests/unit/security.test.ts tests/integration/account.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/features/account/security.ts`:

```ts
import { z } from "zod";

export function isValidEmail(value: string) {
  return z.email().safeParse(value.trim()).success;
}

export function validateNewPassword(next: string, confirm: string) {
  if (next.length < 8) return "password" as const;
  if (next !== confirm) return "mismatch" as const;

  return null;
}
```

`api.ts` additions:

```ts
const REQUEST_FAILED = "Something went wrong. Please try again.";

export async function changePassword(
  supabase: Pick<SupabaseClient, "auth">,
  verifier: Pick<SupabaseClient, "auth">,
  email: string,
  current: string,
  next: string,
) {
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email, password: current });

  if (verifyError) {
    if ((verifyError as { code?: string }).code === "invalid_credentials") return "wrong-password" as const;
    throw new DomainError("ACCOUNT_REQUEST_FAILED", REQUEST_FAILED);
  }

  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  const { error } = await supabase.auth.updateUser({ password: next });

  if (error) throw new DomainError("ACCOUNT_REQUEST_FAILED", REQUEST_FAILED);

  return "ok" as const;
}

export async function changeEmail(supabase: Pick<SupabaseClient, "auth">, email: string) {
  const { error } = await supabase.auth.updateUser({ email: email.trim() });

  if (error) throw new DomainError("ACCOUNT_REQUEST_FAILED", REQUEST_FAILED);
}
```

`client.ts` addition (after `getSupabaseBrowserClient`):

```ts
// A throwaway client used only to verify a password: it never persists a session and uses its own storage key,
// so its sign-in cannot fire the main client's auth events (the root layout blocks the UI while it re-syncs).
export function createPasswordCheckClient() {
  const { publishableKey, url } = readPublicSupabaseConfig();

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false, storageKey: "sb-password-check" },
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `rtk npx jest tests/unit/security.test.ts tests/integration/account.test.ts && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(account): change password with re-auth and change e-mail

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Avatar, MenuBlock, ScreenHeader components

**Files:**
- Create: `src/components/domain/Avatar.tsx`, `MenuBlock.tsx`, `ScreenHeader.tsx`, `src/lib/navigation/use-back.ts`, `tests/unit/profile-components.test.ts`
- Modify: `src/components/domain/index.ts`, `tests/unit/component-exports.test.ts`

**Interfaces:**
- Produces: `Avatar({ name?, uri?, size?: number = 96, onPress?, busy?, accessibilityLabel?, testID? })` — round; image if `uri`, else the initial from `avatarInitial(name)`; camera badge only when `onPress` is set (the whole avatar is then a button).
- Produces: `MenuBlock({ items: MenuRowItem[], testID? })` with `MenuRowItem = { key: string; label: string; icon: LucideIcon; onPress: () => void }`; each row has `testID={`menu-${key}`}`.
- Produces: `ScreenHeader({ title: string, onBack: () => void, backLabel: string, testID? })`.
- Produces: `useBack(): () => void` — `router.back()` if possible, else `router.replace("/profile")`.

- [ ] **Step 1: Write the failing test** — `tests/unit/profile-components.test.ts`

```ts
import { fireEvent, render } from "@testing-library/react-native";
import { User } from "lucide-react-native";
import React from "react";

import { Avatar } from "../../src/components/domain/Avatar";
import { MenuBlock } from "../../src/components/domain/MenuBlock";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";

describe("Avatar", () => {
  it("shows the initial when there is no photo", async () => {
    const view = await render(React.createElement(Avatar, { name: "samuel" }));

    expect(view.getByText("S")).toBeTruthy();
  });

  it("shows the photo when there is a uri", async () => {
    const view = await render(React.createElement(Avatar, { name: "samuel", testID: "av", uri: "http://x/a.jpg" }));

    expect(view.queryByText("S")).toBeNull();
    expect(view.getByTestId("av-image")).toBeTruthy();
  });

  it("is a button only when onPress is given", async () => {
    const onPress = jest.fn();
    const view = await render(React.createElement(Avatar, { accessibilityLabel: "Change photo", name: "s", onPress }));

    fireEvent.press(view.getByLabelText("Change photo"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("MenuBlock", () => {
  it("renders a row per item and fires its onPress", async () => {
    const onPress = jest.fn();
    const view = await render(React.createElement(MenuBlock, {
      items: [{ icon: User, key: "account", label: "My data", onPress }, { icon: User, key: "security", label: "Security", onPress: jest.fn() }],
    }));

    expect(view.getByText("Security")).toBeTruthy();
    fireEvent.press(view.getByTestId("menu-account"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("ScreenHeader", () => {
  it("renders the title as a header and a back button", async () => {
    const onBack = jest.fn();
    const view = await render(React.createElement(ScreenHeader, { backLabel: "Back", onBack, title: "Security" }));

    expect(view.getByRole("header")).toBeTruthy();
    fireEvent.press(view.getByLabelText("Back"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
```

Extend `tests/unit/component-exports.test.ts` domain list with `domain.Avatar`, `domain.MenuBlock`, `domain.ScreenHeader` `toBeDefined()`.

- [ ] **Step 2: Run to verify it fails**

Run: `rtk npx jest tests/unit/profile-components.test.ts tests/unit/component-exports.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`Avatar.tsx`:

```tsx
import { Camera } from "lucide-react-native";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";

import { avatarInitial } from "../../features/account/avatar";
import { colors } from "../../lib/design/colors";

export type AvatarProps = {
  name?: string | null;
  uri?: string | null;
  size?: number;
  onPress?: () => void;
  busy?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function Avatar({ name, uri, size = 96, onPress, busy = false, accessibilityLabel, testID }: AvatarProps) {
  const circle = { borderRadius: size / 2, height: size, width: size };
  const body = (
    <View className="items-center justify-center overflow-hidden bg-primary-100" style={circle}>
      {uri ? (
        <Image accessibilityIgnoresInvertColors source={{ uri }} style={circle} testID={testID ? `${testID}-image` : undefined} />
      ) : (
        <Text className="font-display-bold text-primary-700" style={{ fontSize: size * 0.42 }}>{avatarInitial(name)}</Text>
      )}
      {busy ? (
        <View className="absolute inset-0 items-center justify-center bg-ink/40" style={circle}>
          <ActivityIndicator color={colors.white} />
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;

  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityRole="button" disabled={busy} onPress={onPress} testID={testID}>
      {body}
      <View className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full border-2 border-canvas bg-primary-400">
        <Camera color={colors.ink} size={18} />
      </View>
    </Pressable>
  );
}
```

`MenuBlock.tsx`:

```tsx
import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type MenuRowItem = { key: string; label: string; icon: LucideIcon; onPress: () => void };

export type MenuBlockProps = { items: MenuRowItem[]; testID?: string };

export function MenuBlock({ items, testID }: MenuBlockProps) {
  return (
    <View className="overflow-hidden rounded-[20px] border border-neutral-200 bg-surface" testID={testID}>
      {items.map((item, index) => {
        const Icon = item.icon;

        return (
          <Pressable
            accessibilityRole="button"
            className={`min-h-[56px] flex-row items-center gap-3 px-4 ${index > 0 ? "border-t border-neutral-200" : ""}`}
            key={item.key}
            onPress={item.onPress}
            testID={`menu-${item.key}`}
          >
            <Icon color={colors.primary[600]} size={22} />
            <Text className="flex-1 text-base font-sans-medium text-ink">{item.label}</Text>
            <ChevronRight color={colors.neutral[400]} size={20} />
          </Pressable>
        );
      })}
    </View>
  );
}
```

`ScreenHeader.tsx`:

```tsx
import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type ScreenHeaderProps = { title: string; onBack: () => void; backLabel: string; testID?: string };

export function ScreenHeader({ title, onBack, backLabel, testID }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center gap-2" testID={testID}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        className="min-h-[44px] min-w-[44px] items-center justify-center"
        hitSlop={8}
        onPress={onBack}
        testID="back"
      >
        <ChevronLeft color={colors.ink} size={26} />
      </Pressable>
      <Text accessibilityRole="header" className="text-2xl font-display-bold text-ink">{title}</Text>
    </View>
  );
}
```

`src/lib/navigation/use-back.ts`:

```ts
import { useRouter } from "expo-router";

// A cold start or web refresh on an inner screen has no history to go back to, so fall back to the profile tab.
export function useBack() {
  const router = useRouter();

  return () => (router.canGoBack() ? router.back() : router.replace("/profile"));
}
```

Append to `index.ts`:

```ts
export { Avatar } from "./Avatar";
export type { AvatarProps } from "./Avatar";
export { MenuBlock } from "./MenuBlock";
export type { MenuBlockProps, MenuRowItem } from "./MenuBlock";
export { ScreenHeader } from "./ScreenHeader";
export type { ScreenHeaderProps } from "./ScreenHeader";
```

- [ ] **Step 4: Run to verify it passes**

Run: `rtk npx jest tests/unit/profile-components.test.ts tests/unit/component-exports.test.ts tests/unit/no-hardcoded-text.test.ts && rtk npm run typecheck`
Expected: PASS. (If jest cannot resolve the `bg-ink/40` class or `inset-0`, replace with `style={{ backgroundColor: "rgba(23,20,18,0.4)", ...StyleSheet.absoluteFillObject }}`; the test only checks structure.)

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat(ui): Avatar, MenuBlock and ScreenHeader

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: i18n copy (pt, en, es)

**Files:**
- Modify: `src/i18n/locales/pt.ts`, `en.ts`, `es.ts`

**Interfaces:**
- Produces keys under `profile` (existing keys stay): `menu.{account,security,settings,privacy,about}`, `account.{title,changePhoto,photoError,photoInvalid,photoPermission,emailLabel,changeEmail,newEmail,sendLink,emailSent,emailError,emailInvalid}`, `security.{title,current,next,confirm,submit,changed,wrongCurrent,mismatch,tooShort,error}`, `settings.title`, `privacy.title`, `about.{title,version}`.

- [ ] **Step 1: Add the keys.** Inside `profile: { ... }` of each locale, alphabetically among existing keys (the project sorts them), add:

pt:
```ts
    about: { title: "Sobre", version: "Versão {{version}}" },
    account: {
      changeEmail: "Alterar e-mail",
      changePhoto: "Alterar foto",
      emailError: "Não foi possível alterar o e-mail.",
      emailInvalid: "Informe um e-mail válido.",
      emailLabel: "E-mail",
      emailSent: "Enviamos um link de confirmação para {{email}}. O e-mail muda depois que você abrir o link.",
      newEmail: "Novo e-mail",
      photoError: "Não foi possível atualizar sua foto.",
      photoInvalid: "Use uma imagem JPEG, PNG ou WebP de até 2 MB.",
      photoPermission: "Permita o acesso às fotos para escolher uma imagem.",
      sendLink: "Enviar link de confirmação",
      title: "Meus dados",
    },
    menu: { about: "Sobre", account: "Meus dados", privacy: "Privacidade e dados", security: "Segurança", settings: "Configurações" },
    privacy: { title: "Privacidade e dados" },
    security: {
      changed: "Senha alterada.",
      confirm: "Confirmar nova senha",
      current: "Senha atual",
      error: "Não foi possível alterar a senha.",
      mismatch: "As senhas não coincidem.",
      next: "Nova senha",
      submit: "Alterar senha",
      title: "Segurança",
      tooShort: "Use pelo menos 8 caracteres.",
      wrongCurrent: "A senha atual está incorreta.",
    },
    settings: { title: "Configurações" },
```

en:
```ts
    about: { title: "About", version: "Version {{version}}" },
    account: {
      changeEmail: "Change e-mail",
      changePhoto: "Change photo",
      emailError: "Unable to change your e-mail.",
      emailInvalid: "Enter a valid e-mail.",
      emailLabel: "E-mail",
      emailSent: "We sent a confirmation link to {{email}}. Your e-mail changes after you open the link.",
      newEmail: "New e-mail",
      photoError: "Unable to update your photo.",
      photoInvalid: "Use a JPEG, PNG or WebP image up to 2 MB.",
      photoPermission: "Allow photo access to choose an image.",
      sendLink: "Send confirmation link",
      title: "My data",
    },
    menu: { about: "About", account: "My data", privacy: "Privacy and data", security: "Security", settings: "Settings" },
    privacy: { title: "Privacy and data" },
    security: {
      changed: "Password changed.",
      confirm: "Confirm new password",
      current: "Current password",
      error: "Unable to change your password.",
      mismatch: "The passwords do not match.",
      next: "New password",
      submit: "Change password",
      title: "Security",
      tooShort: "Use at least 8 characters.",
      wrongCurrent: "The current password is incorrect.",
    },
    settings: { title: "Settings" },
```

es:
```ts
    about: { title: "Acerca de", version: "Versión {{version}}" },
    account: {
      changeEmail: "Cambiar correo",
      changePhoto: "Cambiar foto",
      emailError: "No se pudo cambiar el correo.",
      emailInvalid: "Ingresa un correo válido.",
      emailLabel: "Correo",
      emailSent: "Enviamos un enlace de confirmación a {{email}}. El correo cambia después de abrir el enlace.",
      newEmail: "Nuevo correo",
      photoError: "No se pudo actualizar tu foto.",
      photoInvalid: "Usa una imagen JPEG, PNG o WebP de hasta 2 MB.",
      photoPermission: "Permite el acceso a las fotos para elegir una imagen.",
      sendLink: "Enviar enlace de confirmación",
      title: "Mis datos",
    },
    menu: { about: "Acerca de", account: "Mis datos", privacy: "Privacidad y datos", security: "Seguridad", settings: "Configuración" },
    privacy: { title: "Privacidad y datos" },
    security: {
      changed: "Contraseña cambiada.",
      confirm: "Confirmar nueva contraseña",
      current: "Contraseña actual",
      error: "No se pudo cambiar la contraseña.",
      mismatch: "Las contraseñas no coinciden.",
      next: "Nueva contraseña",
      submit: "Cambiar contraseña",
      title: "Seguridad",
      tooShort: "Usa al menos 8 caracteres.",
      wrongCurrent: "La contraseña actual es incorrecta.",
    },
    settings: { title: "Configuración" },
```

- [ ] **Step 2: Verify**

Run: `rtk npx jest tests/unit/locale-parity.test.ts tests/unit/i18n-init.test.ts && rtk npm run typecheck`
Expected: PASS (parity guard covers the three locales).

- [ ] **Step 3: Commit**

```bash
git add src/i18n
git commit -m "feat(i18n): profile hub and inner screen copy in pt, en, es

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hub screen, stack registration, Settings / Privacy / About

**Files:**
- Modify: `app/(customer)/(tabs)/profile.tsx` (rewrite), `app/(customer)/_layout.tsx`, `package.json` (via install)
- Create: `app/(customer)/me/settings.tsx`, `privacy.tsx`, `about.tsx`

**Interfaces:**
- Consumes: `Avatar`, `MenuBlock`, `ScreenHeader`, `useBack`, `useMyProfile`, `listMyCustomers`, existing `saveExportFile`/`buildExportFile`/`exportMyData`/`deleteMyAccount`/`signOut`.
- Produces: route names `me/account`, `me/security`, `me/settings`, `me/privacy`, `me/about`.

- [ ] **Step 1: Install deps and register plugin**

Run: `rtk npx expo install expo-image-picker expo-constants`
Then in `app.json` add to `plugins`: `["expo-image-picker", { "photosPermission": "Allow Barberschedule to access your photos to set your profile picture." }]`.

- [ ] **Step 2: Register the stack screens** in `app/(customer)/_layout.tsx`:

```tsx
      <Stack.Screen name="reschedule" />
      <Stack.Screen name="me/account" />
      <Stack.Screen name="me/security" />
      <Stack.Screen name="me/settings" />
      <Stack.Screen name="me/privacy" />
      <Stack.Screen name="me/about" />
```

- [ ] **Step 3: Rewrite the hub** — `app/(customer)/(tabs)/profile.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Info, LogOut, Settings, ShieldCheck, User, UserCog } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { Toast } from "../../../src/components/domain/Toast";
import { Screen } from "../../../src/components/ui/Screen";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { signOut } from "../../../src/features/auth/api";
import { listMyCustomers } from "../../../src/features/customers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { colors } from "../../../src/lib/design/colors";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const name = customers.data?.[0]?.fullName ?? profile.data?.fullName ?? "";
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar
                accessibilityLabel={t("profile.account.changePhoto")}
                name={name}
                onPress={() => router.push("/me/account")}
                testID="profile-avatar"
                uri={profile.data?.avatarUrl}
              />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
            </View>

            <MenuBlock
              items={[
                { icon: User, key: "account", label: t("profile.menu.account"), onPress: () => router.push("/me/account") },
                { icon: ShieldCheck, key: "security", label: t("profile.menu.security"), onPress: () => router.push("/me/security") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/me/settings") },
                { icon: UserCog, key: "privacy", label: t("profile.menu.privacy"), onPress: () => router.push("/me/privacy") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/me/about") },
              ]}
            />

            <Pressable
              accessibilityRole="button"
              className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-[20px] border border-neutral-200 bg-surface"
              onPress={async () => {
                try {
                  await signOut(supabase);
                } catch (caught) {
                  setError(errorMessage(caught, t as never, t("profile.signOutError")));
                }
              }}
              testID="profile-signout"
            >
              <LogOut color={colors.danger[500]} size={20} />
              <Text className="text-base font-sans-semibold text-danger-500">{t("profile.signOut")}</Text>
            </Pressable>

            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 4: Settings screen** — `app/(customer)/me/settings.tsx` (data export moved from the old screen):

```tsx
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import { buildExportFile, exportMyData } from "../../../src/features/account/api";
import { saveExportFile } from "../../../src/features/account/export-file";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const { supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const exportData = useMutation({
    mutationFn: async () => saveExportFile(buildExportFile(await exportMyData(supabase))),
    onError: (caught) => setFeedback({ message: errorMessage(caught, t as never, t("profile.exportError")), variant: "error" }),
    onSuccess: () => setFeedback({ message: t("profile.exportReady"), variant: "success" }),
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.settings.title")} />
            <Button disabled={exportData.isPending} label={t("profile.download")} onPress={() => exportData.mutate()} testID="profile-export" variant="outline" />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 5: Privacy screen** — `app/(customer)/me/privacy.tsx` (terms + delete flow moved verbatim from the old screen):

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import { deleteMyAccount } from "../../../src/features/account/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: async () => {
      await deleteMyAccount(supabase);
      await supabase.auth.signOut().catch(() => undefined);
    },
    onError: (caught) => {
      setConfirmingDelete(false);
      setError(errorMessage(caught, t as never, t("profile.deleteError")));
    },
    onSuccess: () => queryClient.clear(),
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.privacy.title")} />
            <Button label={t("profile.terms")} onPress={() => router.push("/legal")} variant="outline" />
            {confirmingDelete ? (
              <View className="gap-2">
                <Text className="text-base font-sans text-neutral-700">{t("profile.deleteWarning")}</Text>
                <Button disabled={remove.isPending} label={t("profile.deleteConfirm")} onPress={() => remove.mutate()} testID="profile-delete-confirm" variant="danger" />
                <Button label={t("profile.keep")} onPress={() => setConfirmingDelete(false)} variant="ghost" />
              </View>
            ) : (
              <Button label={t("profile.delete")} onPress={() => setConfirmingDelete(true)} testID="profile-delete" variant="outline" />
            )}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 6: About screen** — `app/(customer)/me/about.tsx`:

```tsx
import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Screen } from "../../../src/components/ui/Screen";
import { useBack } from "../../../src/lib/navigation/use-back";

export default function AboutScreen() {
  const { t } = useTranslation();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.about.title")} />
            <Text className="text-xl font-display-bold text-ink">{t("common.appName")}</Text>
            <Text className="text-base font-sans text-neutral-600" testID="about-version">
              {t("profile.about.version", { version: Constants.expoConfig?.version ?? "" })}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 7: Verify**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest`
Expected: PASS (route-collisions, no-hardcoded-text, locale-parity all green). Fix any failure before continuing. (`/me/*` typed routes: if expo-router typed routes reject the strings, cast with `as never` like the existing `t as never` pattern, or run `npx expo customize tsconfig.json`-style regeneration only if the repo already uses typed routes.)

- [ ] **Step 8: Commit**

```bash
git add app app.json package.json package-lock.json
git commit -m "feat(profile): profile hub with menu blocks and settings, privacy and about screens

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: My data screen (photo, name, phone, e-mail)

**Files:**
- Create: `app/(customer)/me/account.tsx`

**Interfaces:**
- Consumes: `Avatar`, `ScreenHeader`, `useBack`, `useMyProfile`, `updateMyProfile`, `uploadMyAvatar`, `validateAvatar`, `changeEmail`, `isValidEmail`, `listMyCustomers`, `expo-image-picker`.

- [ ] **Step 1: Write the screen**

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { changeEmail, updateMyProfile, uploadMyAvatar } from "../../../src/features/account/api";
import { validateAvatar } from "../../../src/features/account/avatar";
import { isValidEmail } from "../../../src/features/account/security";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { listMyCustomers } from "../../../src/features/customers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Feedback = { message: string; variant: "error" | "success" };

export default function AccountScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const queryClient = useQueryClient();
  const { session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const customer = customers.data?.[0];
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const fail = (caught: unknown, fallback: string) =>
    setFeedback({ message: errorMessage(caught, t as never, fallback), variant: "error" });

  useEffect(() => {
    if (customer) {
      setFullName(customer.fullName);
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: () => updateMyProfile(supabase, { fullName, phone: phone.trim() || null }),
    onError: (caught) => fail(caught, t("profile.saveError")),
    onSuccess: () => {
      setFeedback({ message: t("profile.saved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-customers"] });
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const photo = useMutation({
    mutationFn: async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) return "permission" as const;

      const picked = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"], quality: 0.7,
      });

      if (picked.canceled) return "canceled" as const;

      const blob = await (await fetch(picked.assets[0].uri)).blob();

      if (validateAvatar(blob)) return "invalid" as const;

      await uploadMyAvatar(supabase, session!.user.id, blob, profile.data?.avatarUrl ?? null);

      return "saved" as const;
    },
    onError: (caught) => fail(caught, t("profile.account.photoError")),
    onSuccess: (result) => {
      if (result === "permission") setFeedback({ message: t("profile.account.photoPermission"), variant: "error" });
      if (result === "invalid") setFeedback({ message: t("profile.account.photoInvalid"), variant: "error" });
      if (result === "saved") void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const email = useMutation({
    mutationFn: () => changeEmail(supabase, newEmail),
    onError: (caught) => fail(caught, t("profile.account.emailError")),
    onSuccess: () => {
      setFeedback({ message: t("profile.account.emailSent", { email: newEmail.trim() }), variant: "success" });
      setChangingEmail(false);
      setNewEmail("");
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.account.title")} />
            <View className="items-center gap-2 py-2">
              <Avatar
                accessibilityLabel={t("profile.account.changePhoto")}
                busy={photo.isPending}
                name={fullName}
                onPress={() => photo.mutate()}
                testID="account-avatar"
                uri={profile.data?.avatarUrl}
              />
              <Button label={t("profile.account.changePhoto")} onPress={() => photo.mutate()} size="sm" variant="ghost" />
            </View>

            <Input label={t("common.fullName")} onChangeText={setFullName} testID="profile-name" value={fullName} />
            <Input label={t("common.phoneOptional")} onChangeText={setPhone} testID="profile-phone" value={phone} />
            <Button disabled={save.isPending || !customer} label={t("profile.save")} onPress={() => save.mutate()} testID="profile-save" />

            <Text className="pt-2 text-sm font-sans-medium text-neutral-600">{t("profile.account.emailLabel")}</Text>
            <Text className="text-base font-sans text-ink" testID="account-email">{session?.user.email}</Text>
            {changingEmail ? (
              <View className="gap-2">
                <Input
                  error={newEmail && !isValidEmail(newEmail) ? t("profile.account.emailInvalid") : undefined}
                  label={t("profile.account.newEmail")}
                  onChangeText={setNewEmail}
                  testID="account-new-email"
                  value={newEmail}
                />
                <Button
                  disabled={email.isPending || !isValidEmail(newEmail)}
                  label={t("profile.account.sendLink")}
                  onPress={() => email.mutate()}
                  testID="account-send-link"
                />
                <Button label={t("common.cancel")} onPress={() => setChangingEmail(false)} variant="ghost" />
              </View>
            ) : (
              <Button label={t("profile.account.changeEmail")} onPress={() => setChangingEmail(true)} testID="account-change-email" variant="outline" />
            )}

            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest`
Expected: PASS. (`blob.size`/`blob.type` satisfy `validateAvatar`'s `{ size, type }`.)

- [ ] **Step 3: Commit**

```bash
git add app
git commit -m "feat(profile): my data screen with photo upload, name, phone and e-mail change

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Security screen (change password)

**Files:**
- Create: `app/(customer)/me/security.tsx`

- [ ] **Step 1: Write the screen**

```tsx
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { changePassword } from "../../../src/features/account/api";
import { validateNewPassword } from "../../../src/features/account/security";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { createPasswordCheckClient } from "../../../src/lib/supabase/client";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function SecurityScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const { session, supabase } = useSupabaseSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const problem = next || confirm ? validateNewPassword(next, confirm) : null;
  const problemText = problem === "password" ? t("profile.security.tooShort") : problem === "mismatch" ? t("profile.security.mismatch") : undefined;

  const change = useMutation({
    mutationFn: () => changePassword(supabase, createPasswordCheckClient(), session!.user.email!, current, next),
    onError: (caught) => setFeedback({ message: errorMessage(caught, t as never, t("profile.security.error")), variant: "error" }),
    onSuccess: (result) => {
      if (result === "wrong-password") {
        setFeedback({ message: t("profile.security.wrongCurrent"), variant: "error" });
        return;
      }
      setFeedback({ message: t("profile.security.changed"), variant: "success" });
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.security.title")} />
            <Input label={t("profile.security.current")} onChangeText={setCurrent} secureTextEntry testID="security-current" value={current} />
            <Input label={t("profile.security.next")} onChangeText={setNext} secureTextEntry testID="security-next" value={next} />
            <Input error={problemText} label={t("profile.security.confirm")} onChangeText={setConfirm} secureTextEntry testID="security-confirm" value={confirm} />
            <Button
              disabled={change.isPending || !current || !next || validateNewPassword(next, confirm) !== null}
              label={t("profile.security.submit")}
              onPress={() => change.mutate()}
              testID="security-submit"
            />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

- [ ] **Step 2: Verify**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app
git commit -m "feat(profile): security screen with password change

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Delete the avatar folder on account deletion

**Files:**
- Modify: `supabase/functions/delete-account/index.ts`

- [ ] **Step 1: Implement.** Before the admin user delete (after `prepare_account_deletion` succeeds), remove the user's avatar files with the service key. Insert:

```ts
  // Best effort: a failed cleanup must not block the account deletion the user asked for.
  const listed = await fetch(`${url}/storage/v1/object/list/avatars`, {
    body: JSON.stringify({ limit: 100, prefix: userId }),
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    method: "POST",
  }).catch(() => null);
  const files = listed?.ok ? await listed.json().catch(() => []) as { name: string }[] : [];

  if (files.length > 0) {
    await fetch(`${url}/storage/v1/object/avatars`, {
      body: JSON.stringify({ prefixes: files.map((file) => `${userId}/${file.name}`) }),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      method: "DELETE",
    }).catch(() => undefined);
  }
```

- [ ] **Step 2: Verify manually against local Supabase** (no unit harness exists for the Deno function)

Run: `rtk npx supabase functions serve delete-account --no-verify-jwt` in a background terminal, sign up a throwaway local user, upload a file to `avatars/<uid>/x.jpg` through the storage API, call the function, then confirm the object is gone: `rtk npx supabase db query "select name from storage.objects where bucket_id='avatars'"` (or Studio). If the local CLI lacks `db query`, use `docker exec supabase_db_barberschedule psql -U postgres -c "select name from storage.objects where bucket_id='avatars'"`.
Expected: no rows for that user.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions
git commit -m "feat(account): remove the avatar folder when an account is deleted

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E, browser verification, docs, full verify

**Files:**
- Create: `tests/e2e/profile.web.spec.ts`
- Modify: `tests/e2e/customer-helpers.ts` (only if `get_current_profile` mock lacks `avatar_url`), `docs/project-status.md`

- [ ] **Step 1: Write the E2E test.** Open `tests/e2e/customer-helpers.ts`, find how `mockCustomerRest` fulfils `/rpc/get_current_profile`, and make sure the row can carry `avatar_url: null`. Then create `tests/e2e/profile.web.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

import { signInAsCustomer, mockCustomerRest } from "./customer-helpers";

test("the profile tab is a hub of blocks that open each inner screen", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async () => undefined);

  await page.goto("/profile");
  await expect(page.getByTestId("profile-avatar")).toBeVisible();
  await expect(page.getByText("Browser Customer")).toBeVisible();

  for (const [key, url, heading] of [
    ["account", /\/me\/account$/, "My data"],
    ["security", /\/me\/security$/, "Security"],
    ["settings", /\/me\/settings$/, "Settings"],
    ["privacy", /\/me\/privacy$/, "Privacy and data"],
    ["about", /\/me\/about$/, "About"],
  ] as const) {
    await page.getByTestId(`menu-${key}`).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await page.getByTestId("back").click();
    await expect(page).toHaveURL(/\/profile$/);
  }

  await expect(page.getByTestId("profile-signout")).toBeVisible();
});

test("the account screen shows the login e-mail and reveals the change-e-mail form", async ({ page }) => {
  await signInAsCustomer(page);
  await mockCustomerRest(page, async () => undefined);

  await page.goto("/me/account");
  await expect(page.getByTestId("account-email")).toHaveText("customer@example.com");
  await page.getByTestId("account-change-email").click();
  await expect(page.getByTestId("account-send-link")).toBeDisabled();
  await page.getByTestId("account-new-email").fill("new@example.com");
  await expect(page.getByTestId("account-send-link")).toBeEnabled();
});
```

(If the handler signature or the existing profile e2e in `customer-lifecycle.web.spec.ts` uses different selectors for the old profile screen, update those tests to the new hub: the old `profile-name`, `profile-export`, `profile-delete` ids now live on `/me/account`, `/me/settings`, `/me/privacy`.)

- [ ] **Step 2: Run E2E**

Run: `rtk npm run test:e2e:web`
Expected: PASS; fix the existing customer-lifecycle profile/delete/export tests to navigate via the hub first.

- [ ] **Step 3: Verify in the browser (project rule).** Start the web app (`rtk npm run web`), open `/profile` in the built-in browser at mobile width (375×812), take a screenshot, then use `javascript_tool` to check computed styles: avatar element is 96×96 with `border-radius: 48px`, the menu block has `border-radius: 20px` and dividers (`border-top-width: 1px` on rows 2+), Sair text color is the danger token (`rgb(220, 59, 48)`). Repeat a screenshot for `/me/account` and `/me/security`. Expected: styled, not raw unstyled RN (the failure mode from earlier cycles).

- [ ] **Step 4: Update docs.** In `docs/project-status.md`, add a short entry: customer profile hub (avatar upload, blocks, security, e-mail sync trigger), branch `feat-profile-tab`; note "owner and barber profile screens still pending, reuse `Avatar`/`MenuBlock`/`ScreenHeader`".

- [ ] **Step 5: Full verification**

Run: `rtk npm run verify`
Expected: typecheck, lint, jest, e2e runner and DB tests all PASS.

- [ ] **Step 6: Commit and push**

```bash
git add tests docs
git commit -m "test(profile): e2e for the profile hub and account screen; status notes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin feat-profile-tab
```

Then run the `requesting-code-review` skill on the branch, and open the PR (no force-push/merge).
