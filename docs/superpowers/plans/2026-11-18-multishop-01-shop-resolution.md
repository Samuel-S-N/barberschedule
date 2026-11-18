# Shop resolution (multi-shop, part 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app knows which business it is showing: each shop lives at `<slug>.zencpro.app`, the client resolves the slug from the host, every single-shop spot reads the current shop, and one login works on every subdomain.

**Architecture:** `shops.slug` (migration 0067) is the public identity. A pure `resolveShopSlug(host, baseDomain)` plus a `CurrentShopProvider` (loads the shop by slug once) replace "the first shop by name". A new `get_my_shop()` RPC tells staff which shop they belong to (the root redirects them to their own subdomain), and `ensure_my_customer(p_shop_id)` creates one customer row per shop. On web the Supabase session moves from `localStorage` to cookies on `.zencpro.app`; native keeps SecureStore.

**Tech Stack:** Expo SDK 58 / React Native web static export, Expo Router, TanStack Query, Supabase (Postgres + pgTAP), Jest (jest-expo, RNTL 14 async `render`), Playwright (system Chrome), optional `@supabase/ssr`.

**Spec:** `docs/superpowers/specs/2026-11-18-shop-resolution-design.md`

**Branch:** `feat-shop-resolution` (already checked out, cut from `main` 09e54b2; the 4 specs are its first commits). Part 2 stacks on it as `feat-shop-onboarding`.

## Open questions for the orchestrator

Found while grounding the plan against the code. None changes the approved design; each one says what this plan does meanwhile. Answer or veto before execution.

1. **`getOwnerShopId` cannot "filter by `owner_user_id`".** `owner_user_id` has no column grant for `anon`/`authenticated` (`0004_initial_rls.sql:54` grants only `id, name, timezone`; later migrations add `address…`, `theme_*`, never `owner_user_id`), so PostgREST rejects `.eq("owner_user_id", …)` with 42501. Staff also need their own shop's slug to be redirected, and `professionals.user_id` is not readable either. **Plan does:** a new `security definer` RPC `get_my_shop()` (migration 0068) returning `(shop_id, slug)` for the caller as owner or professional; `getOwnerShopId` and the staff redirect both use it. No new column grant, owner uuid stays private.
2. **Customer notifications have no shop.** `public.notifications` has no `shop_id` and `params` carries none (`0046_notifications_inbox.sql`), so "a `shop_id` filter" is not possible without schema work. `list_my_recurrence_requests()` (0058) also has no shop filter. **Plan does:** migration 0069 adds `notifications.shop_id` filled by a `BEFORE INSERT` trigger (from `appointment_id`, else the recipient's own shop if staff) plus backfill, and gives `list_my_recurrence_requests` an optional `p_shop_id`. **Known limit:** a customer's recurrence-accepted/rejected/cancel inbox rows have no appointment and no staff shop, so `shop_id` stays null and they show on every shop the customer uses. Scoping them exactly means touching 8 `add_inbox_event` call sites (0050/0053/0058); say so if you want that instead.
3. **`listMyCustomers` is another single-shop spot the spec does not name.** `home.tsx`, `profile.tsx`, `me/account.tsx` take `customers.data[0]`, and `account.tsx` edits that row. With one customer row per shop that is the wrong row. **Plan does:** `listMyCustomers(supabase, shopId)` filters by the current shop.
4. **`slug text not null unique` breaks ~45 pgTAP files** (`insert into public.shops (id, name, owner_user_id)` without a slug, plus `supabase/seed.sql`, `dev-owner.sql` flows and Jest/e2e fixtures). **Plan does:** the column gets a default `'shop-' || 8 hex chars` (valid, not reserved), so existing inserts keep working and no test file needs a slug; `seed.sql` sets `seed-shop` explicitly; `create_shop` (part 2) always passes a real one.
5. **e2e is the biggest cost of this part.** All 50 Playwright specs run on `http://127.0.0.1:4173` (no slug) and 36 of them seed the session as `localStorage["sb-example-auth-token"]`. Both break. **Plan does:** the base URL moves to a shop host (`http://shop-a.localhost:<port>`), a Playwright fixture answers the slug lookup for every spec (no per-spec edits), and, if the spike picks the hand-written cookie adapter (Path B), the adapter keeps reading the legacy `localStorage` key so the 36 specs need **no edits**. If the spike picks `@supabase/ssr` (Path A), Task 13 adds a cookie-seeding helper and a mechanical edit of those 36 specs. This is a reason to prefer Path B unless the spike shows a concrete advantage of A.
6. **The spec's e2e example hosts `a.localhost` / `b.localhost` are invalid slugs** (the format needs 3 to 32 characters). **Plan uses** `shop-a.localhost` and `shop-b.localhost`.
7. **`createBrowserClient` forces PKCE by default.** A PKCE reset link only works in the browser that asked for it (the code verifier lives there), and phone e-mail apps often open links in another browser. The spike (Task 1) tests exactly this and decides Path A or B on it.
8. **Spec section 4 lists `getShopTheme` as a "single-shop spot", but the theme is also loaded only for signed-in users today** (`ShopThemeProvider` has `enabled: Boolean(userId)`), so the shop's colours would not show on its login page. **Plan does:** key the theme query and its local cache by slug instead of user id (spec section 3 already promises "with its colours" for signed-out visitors).

## Global Constraints

- Slug format: `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` (3 to 32 characters, lowercase letters, digits and hyphens, no hyphen at either end).
- Reserved slugs (check constraint; adding one later is a migration): `www`, `app`, `api`, `admin`, `zenc`, `mail`, `email`, `smtp`, `static`, `assets`, `cdn`, `docs`, `help`, `support`, `status`, `blog`, `dev`, `staging`, `test`, `login`, `auth`.
- The slug is publicly readable (same column grant as `name`); the owner cannot change it (no `update` grant).
- `baseDomain` from `EXPO_PUBLIC_SHOP_BASE_DOMAIN` (`zencpro.app` in production, `localhost` in development); native uses `EXPO_PUBLIC_DEV_SHOP_SLUG`; cookie domain from `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN` (unset in development = per-host cookies).
- Cookies are `Secure` (when served over https) and `SameSite=Lax`. `zenc.language` stays in `localStorage`. Native keeps SecureStore.
- `ensure_my_customer(p_shop_id uuid)`: unknown shop raises the existing `P0007 CUSTOMER_UNAVAILABLE`. Next free migration number is **0067**, next free pgTAP file **049**, next free error code **P0041** (not used in this part).
- Behaviour table (spec section 3): not signed in on a shop host sees that shop's login with its colours; on the bare domain a simple "open the link your business sent you" page plus staff login; a customer sees only the current shop's data; staff on another shop's host (or on the bare domain) are redirected to their own shop's subdomain.
- Project conventions: every `<Input>` needs a `placeholder` (an `examples.*` key); text in pt/es/en (`src/i18n/locales/{en,pt,es}.ts`, parity enforced by `tests/unit/locale-parity.test.ts`); new routes need an entry in `src/lib/navigation/parents.ts` (this part adds **no** route); pop-ups are centred floating windows with an X; owner screens are declared in `app/(owner)/_layout.tsx` (no new owner screen here).
- Checks after every task: `npx tsc --noEmit`, `./node_modules/.bin/eslint app src tests scripts` (root `npm run lint` is also clean since PR #98, run it once at the end), the Jest files named in the task. pgTAP after any SQL change: `npx supabase db reset && npx supabase test db`. Playwright runs with the system Chrome and `.env.local` moved aside (see Task 14).

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0067_shop_slug.sql` (new) | `shops.slug` column, format and reserved-name checks, unique, public read grant |
| `supabase/migrations/0068_shop_resolution_rpcs.sql` (new) | `get_my_shop()`, `ensure_my_customer(p_shop_id)` |
| `supabase/migrations/0069_customer_shop_scoping.sql` (new) | `notifications.shop_id` + trigger + backfill, `list_my_recurrence_requests(p_shop_id)` |
| `supabase/tests/049_shop_slug.sql`, `050_shop_resolution_rpcs.sql`, `051_customer_shop_scoping.sql` (new) | pgTAP for the three migrations |
| `src/features/shops/resolve-slug.ts` (new) | pure `resolveShopSlug`, `RESERVED_SLUGS`, `shopUrl` |
| `src/features/shops/host.ts` (new) | `currentShopSlug()` reading the browser host or the dev env var |
| `src/features/shops/CurrentShopProvider.tsx` (new) | `CurrentShopProvider`, `useCurrentShop()` |
| `src/features/shops/my-shop.ts` (new) | `getMyShop`, `useMyShop` (staff shop via `get_my_shop`) |
| `src/features/shops/shop-route.ts` (new) | pure `resolveShopRoute` decision table |
| `src/features/shops/ShopGate.tsx` (new) | applies the decision: spinner, not-found, bare-domain page, error, redirect |
| `src/features/shops/api.ts`, `theme.ts`, `ShopThemeProvider.tsx`, `use-shop-info.ts`, `use-owner-shop-id.ts` (modify) | read the current shop |
| `src/lib/supabase/cookie-storage.ts` (new, Path B) / `client.ts` (modify) | cookie session storage on web |
| `tests/e2e/fixtures.ts` (new) | Playwright `test` fixture answering the slug lookup |

---

### Task 1: Spike — Supabase session in cookies on the static web export

**Why first:** the spec calls `@supabase/ssr` in a static Expo web export "a new combination". Everything cookie-related (Task 12, the e2e plan) depends on this answer. Throwaway code: nothing from this task is committed except the decision note.

**Files:**
- Create: `docs/superpowers/spikes/2026-11-18-cookie-session.md` (the decision note, the only committed file)
- Temporary (revert before commit): `package.json`/`package-lock.json` (+`@supabase/ssr`), `src/lib/supabase/client.ts`

**Interfaces:**
- Produces: a recorded decision, **Path A** (`createBrowserClient` from `@supabase/ssr`) or **Path B** (hand-written chunked cookie storage adapter on `createClient`). Task 12 implements exactly one of them.

- [ ] **Step 1: Prepare a local stack and a scratch build**

```bash
npx supabase status | head -5          # local stack must be running; otherwise: npx supabase start
npm i --no-save @supabase/ssr         # --no-save: nothing lands in package.json yet
mv .env.local /tmp/claude-1000/-home-samuel-projects-barberschedule/env.local.bak   # LAN URL breaks local browser checks; restore at the end
```

Use the local stack's URL and publishable key printed by `npx supabase status` as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the build below.

- [ ] **Step 2: Temporarily switch the web client to `createBrowserClient`**

In `src/lib/supabase/client.ts`, replace the body of `getSupabaseBrowserClient` for the web branch with:

```ts
import { createBrowserClient } from "@supabase/ssr";
// ...
browserClient = Platform.OS === "web"
  ? (createBrowserClient(url, publishableKey, {
      auth: { flowType: "implicit" },
      cookieOptions: { sameSite: "lax", secure: window.location.protocol === "https:" },
    }) as unknown as SupabaseClient)
  : createClient(url, publishableKey, { auth: buildSupabaseAuthOptions() });
(window as unknown as { __spikeClient?: unknown }).__spikeClient = browserClient;
```

- [ ] **Step 3: Export, serve and open on a shop-like host**

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=<local url> EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local key> \
  npx expo export --platform web --output-dir /tmp/claude-1000/-home-samuel-projects-barberschedule/spike-dist
node scripts/serve-web-static.mjs /tmp/claude-1000/-home-samuel-projects-barberschedule/spike-dist 4290 &
```

Open `http://shop-a.localhost:4290/login` in the built-in browser (Chrome resolves `*.localhost` to loopback with no DNS setup) and sign in with `owner@teste.com` / `owner1234` (load `supabase/dev-owner.sql` first if that account does not exist).

- [ ] **Step 4: Run the checks and write down each result**

Run these in the page (`javascript_tool`) and record pass/fail:
1. `document.cookie` contains `sb-…-auth-token` (possibly `.0`, `.1` chunks) and `localStorage` has no `sb-*-auth-token` key.
2. Reload the page: still signed in. Delete the `localStorage` entries and reload: still signed in (the cookie is the source of truth).
3. `window.__spikeClient.auth.flowType` is `"implicit"` (the override was honoured). If it reads `"pkce"` the library forces PKCE.
4. Password reset link opened without the original browser state: request a reset for the owner on `/forgot-password`, read the e-mail at `http://127.0.0.1:54324` (Mailpit), then clear all cookies and local storage for the origin and open the link. **Pass** = the reset screen accepts a new password (implicit tokens in the URL hash). **Fail** = "link invalid" (PKCE needs the verifier from the requesting browser).
5. Admin invite link (`supabase.auth.admin.inviteUserByEmail`, same as part 2): open it in the cleared browser; **Pass** = the session is created from the hash.
6. Native bundle still builds: `npx expo export --platform android --output-dir /tmp/claude-1000/-home-samuel-projects-barberschedule/spike-native` finishes without error (the `@supabase/ssr` import must not break Metro for native).
7. Cookie size: after sign-in with the dev owner, every cookie is under 4096 bytes (`document.cookie.split("; ").map(c => c.length)`).

- [ ] **Step 5: Decide and record**

Go/no-go rule, written into `docs/superpowers/spikes/2026-11-18-cookie-session.md` together with the raw results:
- **Path A (`@supabase/ssr`)** only if checks 1, 2, 3, 4, 5, 6, 7 all pass.
- **Path B (hand-written chunked cookie adapter on `createClient`, implicit flow)** otherwise, and also when A passes but the orchestrator prefers not to edit 36 e2e specs (Open question 5). Path B also lets the adapter fall back to the legacy `localStorage` key, so nothing seeded or stored there breaks.
- State the chosen path in the first line of the note: `Decision: Path A` or `Decision: Path B`.

- [ ] **Step 6: Revert the experiment and commit only the note**

```bash
git checkout src/lib/supabase/client.ts package.json package-lock.json
mv /tmp/claude-1000/-home-samuel-projects-barberschedule/env.local.bak .env.local
kill %1 2>/dev/null
git add docs/superpowers/spikes/2026-11-18-cookie-session.md
git commit -m "docs(spike): cookie session on the static web export (multi-shop part 1)"
```

---

### Task 2: Migration 0067 — `shops.slug`

**Files:**
- Create: `supabase/migrations/0067_shop_slug.sql`
- Create: `supabase/tests/049_shop_slug.sql`
- Modify: `supabase/seed.sql:17-19`

**Interfaces:**
- Produces: `public.shops.slug text not null unique` (default `'shop-' + 8 hex`), publicly readable, not updatable by `authenticated`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/049_shop_slug.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't49-owner1@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'f9000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't49-owner2@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id in ('f9000000-0000-0000-0000-000000000001', 'f9000000-0000-0000-0000-000000000002');

insert into public.shops (id, name, owner_user_id)
values
  ('f9100000-0000-0000-0000-000000000001', 'T49 Shop One', 'f9000000-0000-0000-0000-000000000001'),
  ('f9100000-0000-0000-0000-000000000002', 'T49 Shop Two', 'f9000000-0000-0000-0000-000000000002');

select matches(
  (select slug from public.shops where id = 'f9100000-0000-0000-0000-000000000001'),
  '^shop-[0-9a-f]{8}$',
  'a shop inserted without a slug gets a generated one'
);

select throws_ok($$ update public.shops set slug = 'ab' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'too short is rejected');
select throws_ok($$ update public.shops set slug = 'Has-Caps' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'uppercase is rejected');
select throws_ok($$ update public.shops set slug = '-leading' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'a leading hyphen is rejected');
select throws_ok($$ update public.shops set slug = 'trailing-' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'a trailing hyphen is rejected');
select throws_ok($$ update public.shops set slug = repeat('a', 33) where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, '33 characters is rejected');
select throws_ok($$ update public.shops set slug = 'www' where id = 'f9100000-0000-0000-0000-000000000001' $$, '23514', null, 'a reserved name is rejected');

select lives_ok($$ update public.shops set slug = 'barbeariadojoao' where id = 'f9100000-0000-0000-0000-000000000001' $$, 'a valid slug is accepted');
select throws_ok($$ update public.shops set slug = 'barbeariadojoao' where id = 'f9100000-0000-0000-0000-000000000002' $$, '23505', null, 'a slug is unique');

set local role anon;
select results_eq(
  $$ select slug from public.shops where id = 'f9100000-0000-0000-0000-000000000001' $$,
  $$ values ('barbeariadojoao'::text) $$,
  'anonymous visitors can read the slug'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ update public.shops set slug = 'mudei-o-slug' where id = 'f9100000-0000-0000-0000-000000000001' $$, '42501', null, 'the owner cannot change the slug');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `049_shop_slug.sql` fails (`column "slug" of relation "shops" does not exist`); the other files pass.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0067_shop_slug.sql`:

```sql
-- Each business lives at <slug>.zencpro.app (decision 015). The slug is set once by create_shop (multi-shop part 2) and
-- printed on QR codes, so shop owners get no update grant on it. The default keeps every existing insert (tests, seed,
-- dev scripts) valid: 'shop-' + 8 hex characters matches the format and is not reserved.
alter table public.shops
  add column slug text not null default ('shop-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

-- Databases that were not reset: give the seed shop its readable slug.
update public.shops set slug = 'seed-shop' where id = 'a1000000-0000-0000-0000-000000000001';

alter table public.shops
  add constraint shops_slug_key unique (slug),
  add constraint shops_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  add constraint shops_slug_not_reserved check (slug <> all (array[
    'www', 'app', 'api', 'admin', 'zenc', 'mail', 'email', 'smtp', 'static', 'assets', 'cdn',
    'docs', 'help', 'support', 'status', 'blog', 'dev', 'staging', 'test', 'login', 'auth'
  ]));

grant select (slug) on table public.shops to anon, authenticated;
```

Edit `supabase/seed.sql` lines 17 to 19 so the seed shop is created with its slug:

```sql
insert into public.shops (id, name, slug, timezone, owner_user_id)
values ('a1000000-0000-0000-0000-000000000001', 'Seed Shop', 'seed-shop', 'America/Sao_Paulo', 'a0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
```

- [ ] **Step 4: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files pass, including `049_shop_slug.sql` (11/11). If `010_full_rls.sql` fails because dev accounts were loaded, that is the known post-reset gotcha: reset again without loading them.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0067_shop_slug.sql supabase/tests/049_shop_slug.sql supabase/seed.sql
git commit -m "feat(db): shops.slug with format, reserved names and public read"
```

---

### Task 3: Migration 0068 — `get_my_shop()` and `ensure_my_customer(p_shop_id)`

**Files:**
- Create: `supabase/migrations/0068_shop_resolution_rpcs.sql`
- Create: `supabase/tests/050_shop_resolution_rpcs.sql`
- Modify (call sites): `supabase/tests/011_customer_self_service.sql` (5 calls), `014_customer_profile.sql` (1), `015_profile_nickname.sql` (1), `019_claim_customer_on_signup.sql` (8)

**Interfaces:**
- Produces: `public.get_my_shop() returns table (shop_id uuid, slug text)` (owner's shop, else the active professional's shop, else no rows; `authenticated` only) and `public.ensure_my_customer(p_shop_id uuid) returns public.customers`. The zero-argument `ensure_my_customer()` is dropped.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/050_shop_resolution_rpcs.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't50-ownera@example.com', 'x', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't50-ownerb@example.com', 'x', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't50-pro@example.com', 'x', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't50-customer@example.com', 'x', now(), '{"full_name":"T50 Customer"}'),
  ('00000000-0000-0000-0000-000000000000', 'fa000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 't50-claim@example.com', 'x', now(), '{"full_name":"T50 Claim"}');
update public.profiles set role = 'owner' where user_id in ('fa000000-0000-0000-0000-000000000001', 'fa000000-0000-0000-0000-000000000002');
update public.profiles set role = 'professional' where user_id = 'fa000000-0000-0000-0000-000000000003';

-- Shop A sorts before shop B by name AND by created_at: an "alphabetical first" lookup would wrongly pick it for owner B.
insert into public.shops (id, name, slug, owner_user_id, created_at)
values
  ('fa100000-0000-0000-0000-000000000001', 'AAA T50 Shop', 'shop-aaa', 'fa000000-0000-0000-0000-000000000001', '2000-01-01'),
  ('fa100000-0000-0000-0000-000000000002', 'BBB T50 Shop', 'shop-bbb', 'fa000000-0000-0000-0000-000000000002', '2000-01-02');
insert into public.professionals (id, shop_id, name, user_id)
values ('fa200000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000002', 'T50 Pro', 'fa000000-0000-0000-0000-000000000003');

update public.app_settings set email_claim_enabled = true;
insert into public.customers (id, shop_id, full_name, email)
values
  ('fa300000-0000-0000-0000-000000000001', 'fa100000-0000-0000-0000-000000000001', 'Pre A', 't50-claim@example.com'),
  ('fa300000-0000-0000-0000-000000000002', 'fa100000-0000-0000-0000-000000000002', 'Pre B', 't50-claim@example.com');

-- get_my_shop
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000002', true);
select is((select slug from public.get_my_shop()), 'shop-bbb', 'owner B gets shop B, not the alphabetically first shop');

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000003', true);
select is((select slug from public.get_my_shop()), 'shop-bbb', 'a professional gets the shop they work in');

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.get_my_shop()), 0, 'a customer has no staff shop');

-- ensure_my_customer(p_shop_id)
select ok((select id from public.ensure_my_customer('fa100000-0000-0000-0000-000000000001')) is not null, 'creates the customer row in shop A');
select ok((select id from public.ensure_my_customer('fa100000-0000-0000-0000-000000000002')) is not null, 'creates the customer row in shop B');
select is(
  (select count(*)::int from public.customers where user_id = 'fa000000-0000-0000-0000-000000000004'),
  2, 'one customer row per shop'
);
select is(
  (select count(*)::int from public.customers where user_id = 'fa000000-0000-0000-0000-000000000004' and shop_id = 'fa100000-0000-0000-0000-000000000001'),
  1, 'and it is idempotent within a shop'
);

select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000005', true);
select is((select full_name from public.ensure_my_customer('fa100000-0000-0000-0000-000000000001')), 'Pre A', 'the e-mail claim links the pre-created row of that shop');
reset role;
select is(
  (select user_id from public.customers where id = 'fa300000-0000-0000-0000-000000000002'),
  null::uuid, 'and leaves the same e-mail in the other shop unclaimed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select * from public.ensure_my_customer('fa1fffff-0000-0000-0000-00000000dead') $$, 'P0007', 'CUSTOMER_UNAVAILABLE', 'an unknown shop raises CUSTOMER_UNAVAILABLE');
select throws_ok($$ select * from public.ensure_my_customer() $$, '42883', null, 'the zero-argument version is gone');
reset role;

select * from finish();
rollback;
```

The file has 11 assertions (3 for `get_my_shop`, 2 creates, 2 counts, 1 claim, 1 unclaimed, 2 errors), matching `plan(11)`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `050` fails (`function public.get_my_shop() does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0068_shop_resolution_rpcs.sql`:

```sql
-- Which shop is "mine" for a staff account. `shops.owner_user_id` and `professionals.user_id` are not readable by clients, so
-- this security definer RPC is the only way the app learns its own shop (to redirect staff to their subdomain and to scope
-- every owner screen). Customers have no staff shop: they get no rows.
create function public.get_my_shop()
returns table (shop_id uuid, slug text)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select id, slug from (
    select s.id, s.slug, 1 as rank from public.shops s where s.owner_user_id = auth.uid()
    union all
    select s.id, s.slug, 2 from public.professionals p
    join public.shops s on s.id = p.shop_id
    where p.user_id = auth.uid() and p.active and p.archived_at is null
  ) mine
  order by rank
  limit 1;
$$;

revoke all on function public.get_my_shop() from public, anon;
grant execute on function public.get_my_shop() to authenticated;

-- ensure_my_customer is shop-scoped now: the app calls it when a signed-in customer opens a shop's subdomain, so the account
-- gets one customer row per shop it uses. Body unchanged from 0039 except for the shop lookup.
drop function public.ensure_my_customer();

create function public.ensure_my_customer(p_shop_id uuid)
returns public.customers
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  shop uuid;
  account_email text;
  account_confirmed boolean;
  meta jsonb;
  consent_version text;
  result public.customers;
  mine public.customers;
  stale public.customers;
begin
  if actor is null
    or coalesce((select role::text from public.profiles where user_id = actor), '') <> 'customer'
  then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select id into shop from public.shops where id = p_shop_id;
  if shop is null then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  select email, email_confirmed_at is not null, coalesce(raw_user_meta_data, '{}'::jsonb)
  into account_email, account_confirmed, meta
  from auth.users where id = actor;

  -- A professional may have booked this person before they had an account: link that row (history included) by confirmed email.
  -- With email confirmations off, Supabase stamps email_confirmed_at at signup, so the column alone proves nothing:
  -- claiming also needs the per-environment flag, turned on only where confirmations are enforced.
  if account_confirmed and (select email_claim_enabled from public.app_settings) then
    update public.customers c
    set user_id = actor
    where c.shop_id = shop
      and c.user_id is null
      and c.active
      and lower(c.email) = lower(account_email)
      and not exists (select 1 from public.customers x where x.shop_id = shop and x.user_id = actor);

    -- Signed up before the claim was enabled (or before the professional booked them): the account already has its own row,
    -- so merge the professional-created one into it instead of leaving the history stranded.
    select * into mine from public.customers where shop_id = shop and user_id = actor;
    if found then
      select * into stale from public.customers
      where shop_id = shop and user_id is null and active and lower(email) = lower(account_email) and id <> mine.id;
      if found then
        update public.appointments set customer_id = mine.id where customer_id = stale.id;
        update public.recurrence_series set customer_id = mine.id where customer_id = stale.id;
        insert into public.professional_customer_notes (professional_id, customer_id, note, updated_at)
        select professional_id, mine.id, note, updated_at from public.professional_customer_notes where customer_id = stale.id
        on conflict do nothing;
        delete from public.customers where id = stale.id;
        update public.customers set email = coalesce(email, stale.email), phone = coalesce(phone, stale.phone) where id = mine.id;
      end if;
    end if;
  end if;

  -- ON CONFLICT keeps concurrent bootstraps (double mount, two tabs, retries) from failing on the unique index.
  insert into public.customers (shop_id, user_id, full_name, email, phone)
  values (
    shop,
    actor,
    coalesce((select full_name from public.profiles where user_id = actor), split_part(account_email, '@', 1)),
    -- Keep customers_shop_email_key satisfied when an unclaimed row (unconfirmed account) already owns the email.
    case when exists (
      select 1 from public.customers x where x.shop_id = shop and lower(x.email) = lower(account_email)
    ) then null else account_email end,
    nullif(btrim(meta ->> 'phone'), '')
  )
  on conflict (shop_id, user_id) where user_id is not null do nothing;

  select * into result from public.customers where shop_id = shop and user_id = actor;

  consent_version := nullif(btrim(meta ->> 'accepted_terms_version'), '');
  if consent_version is not null then
    insert into public.consents (user_id, kind, version)
    values (actor, 'terms', consent_version), (actor, 'privacy', consent_version)
    on conflict do nothing;
  end if;

  return result;
end;
$$;

revoke all on function public.ensure_my_customer(uuid) from public, anon;
grant execute on function public.ensure_my_customer(uuid) to authenticated;
```

- [ ] **Step 4: Update the 4 older pgTAP files that call the zero-argument version**

Each of these files defines a single shop; pass its id. In `011_customer_self_service.sql` the shop id is `71000000-0000-0000-0000-000000000001`; run
`grep -n "ensure_my_customer()" supabase/tests/011_customer_self_service.sql supabase/tests/014_customer_profile.sql supabase/tests/015_profile_nickname.sql supabase/tests/019_claim_customer_on_signup.sql`
and replace each `ensure_my_customer()` with `ensure_my_customer('<that file's shop id>')`: 011 → `71000000-0000-0000-0000-000000000001`, 019 → `f1000000-0000-0000-0000-000000000001`; for 014 and 015 take the id from the file's own `insert into public.shops` line.

- [ ] **Step 5: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files pass, `050_shop_resolution_rpcs.sql` 11/11.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0068_shop_resolution_rpcs.sql supabase/tests/050_shop_resolution_rpcs.sql supabase/tests/011_customer_self_service.sql supabase/tests/014_customer_profile.sql supabase/tests/015_profile_nickname.sql supabase/tests/019_claim_customer_on_signup.sql
git commit -m "feat(db): get_my_shop and shop-scoped ensure_my_customer"
```

---

### Task 4: Migration 0069 — customer notifications and recurrence requests scoped to a shop

**Files:**
- Create: `supabase/migrations/0069_customer_shop_scoping.sql`
- Create: `supabase/tests/051_customer_shop_scoping.sql`

**Interfaces:**
- Produces: `public.notifications.shop_id uuid references public.shops(id)` (nullable; trigger-filled), `public.list_my_recurrence_requests(p_shop_id uuid default null)` (same columns as 0058).
- Consumes: Task 2/3 fixtures only (no function from them).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/051_customer_shop_scoping.sql` (fixture copied from `029_notifications_inbox.sql`, ids re-prefixed):

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't51-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't51-customer@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fb000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't51-pro@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fb000000-0000-0000-0000-000000000001';
update public.profiles set role = 'professional' where user_id = 'fb000000-0000-0000-0000-000000000003';

insert into public.shops (id, name, owner_user_id)
values ('fb100000-0000-0000-0000-000000000001', 'T51 Shop', 'fb000000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('fb110000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000002', 'T51 Customer', 't51-customer@shop.example');
insert into public.professionals (id, shop_id, name, user_id)
values ('fb200000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'T51 Pro', 'fb000000-0000-0000-0000-000000000003');
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('fb300000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'T51 Cut', 30, 4000);
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('fb400000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001', 'fb200000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001');

-- A scheduled appointment (no JWT, so nobody is the actor): the booking trigger writes the staff inbox rows.
insert into public.appointments (
  id, shop_id, professional_id, customer_id, professional_service_id, service_id,
  starts_at, ends_at, occupied_until, service_name_snapshot,
  service_duration_minutes_snapshot, service_price_cents_snapshot, professional_buffer_minutes_snapshot
) values (
  'fb500000-0000-0000-0000-000000000001', 'fb100000-0000-0000-0000-000000000001',
  'fb200000-0000-0000-0000-000000000001', 'fb110000-0000-0000-0000-000000000001',
  'fb400000-0000-0000-0000-000000000001', 'fb300000-0000-0000-0000-000000000001',
  clock_timestamp() + interval '24 hours', clock_timestamp() + interval '24 hours 30 minutes',
  clock_timestamp() + interval '24 hours 30 minutes', 'T51 Cut', 30, 4000, 0
);

select is(
  (select count(*)::int from public.notifications where appointment_id = 'fb500000-0000-0000-0000-000000000001' and shop_id = 'fb100000-0000-0000-0000-000000000001'),
  2, 'booking notifications get the appointment''s shop'
);

insert into public.notifications (user_id, kind, params, event_key)
values
  ('fb000000-0000-0000-0000-000000000001', 'payout_due', '{}', 't51-owner'),
  ('fb000000-0000-0000-0000-000000000003', 'payout_paid', '{}', 't51-pro'),
  ('fb000000-0000-0000-0000-000000000002', 'recurrence_accepted', '{}', 't51-customer');

select is((select shop_id from public.notifications where event_key = 't51-owner'), 'fb100000-0000-0000-0000-000000000001'::uuid, 'an owner notification gets their shop');
select is((select shop_id from public.notifications where event_key = 't51-pro'), 'fb100000-0000-0000-0000-000000000001'::uuid, 'a professional notification gets their shop');
select is((select shop_id from public.notifications where event_key = 't51-customer'), null::uuid, 'a customer notification with no appointment stays unscoped');

-- list_my_recurrence_requests filter
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fb000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select count(*)::int from public.list_my_recurrence_requests()), 0, 'no argument still works');
select is((select count(*)::int from public.list_my_recurrence_requests('fb100000-0000-0000-0000-000000000001')), 0, 'a shop id filters');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `051` fails (`column "shop_id" does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0069_customer_shop_scoping.sql`:

```sql
-- A customer who uses two businesses must see each business's inbox on its own subdomain. The inbox row gets the shop of the
-- appointment it is about, else the recipient's own staff shop. Customer rows about recurrence (accepted/rejected/cancel) carry
-- neither, stay null and show on every shop the customer uses (a known limit, see multi-shop plan 1, open question 2).
alter table public.notifications add column shop_id uuid references public.shops (id) on delete cascade;

create function public.notifications_set_shop()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.shop_id is null and new.appointment_id is not null then
    select shop_id into new.shop_id from public.appointments where id = new.appointment_id;
  end if;
  if new.shop_id is null then
    select s.id into new.shop_id from public.shops s where s.owner_user_id = new.user_id;
  end if;
  if new.shop_id is null then
    select p.shop_id into new.shop_id from public.professionals p where p.user_id = new.user_id and p.active limit 1;
  end if;
  return new;
end;
$$;

create trigger notifications_set_shop before insert on public.notifications
for each row execute function public.notifications_set_shop();

-- Backfill with the same rules.
update public.notifications n
set shop_id = coalesce(
  (select a.shop_id from public.appointments a where a.id = n.appointment_id),
  (select s.id from public.shops s where s.owner_user_id = n.user_id),
  (select p.shop_id from public.professionals p where p.user_id = n.user_id and p.active limit 1)
)
where n.shop_id is null;

create index notifications_shop_idx on public.notifications (user_id, shop_id, created_at desc);

-- Same columns as 0058; the optional shop narrows the list to one business.
drop function public.list_my_recurrence_requests();
create function public.list_my_recurrence_requests(p_shop_id uuid default null)
returns table (
  id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
  professional_name text, service_name text, recurrence_cents integer,
  series_id uuid, series_active boolean, series_ended_at timestamptz, plan_name text, cancel_requested_at timestamptz
)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks),
         r.series_id, rs.active, rs.ended_at,
         (select pl.name from public.recurrence_plans pl where pl.service_id = s.id and pl.interval_weeks = r.interval_weeks order by pl.active desc, pl.created_at desc limit 1),
         rs.cancel_requested_at
  from public.recurrence_requests r
  join public.customers c on c.id = r.customer_id and c.user_id = auth.uid()
  join public.professionals b on b.id = r.professional_id
  join public.professional_services bs on bs.id = r.professional_service_id
  join public.services s on s.id = bs.service_id
  left join public.recurrence_series rs on rs.id = r.series_id
  where p_shop_id is null or r.shop_id = p_shop_id
  order by r.created_at desc limit 20;
$$;
revoke all on function public.list_my_recurrence_requests(uuid) from public, anon;
grant execute on function public.list_my_recurrence_requests(uuid) to authenticated;
```

- [ ] **Step 4: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files pass; `051` 6/6; `029` and `044` still pass (the trigger does not change their counts).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0069_customer_shop_scoping.sql supabase/tests/051_customer_shop_scoping.sql
git commit -m "feat(db): shop-scoped notifications and recurrence request list"
```

---

### Task 5: Pure host helpers — `resolveShopSlug`, `shopUrl`, `currentShopSlug`

**Files:**
- Create: `src/features/shops/resolve-slug.ts`
- Create: `src/features/shops/host.ts`
- Test: `tests/unit/resolve-shop-slug.test.ts`

**Interfaces:**
- Produces:
  - `RESERVED_SLUGS: readonly string[]`, `SLUG_PATTERN: RegExp`
  - `resolveShopSlug(host: string, baseDomain: string): string | null`
  - `shopUrl(slug: string, baseDomain: string, location: { protocol: string; port: string }): string` (origin + `/`)
  - `currentShopSlug(): string | null` (web: from `window.location.host`; native: `EXPO_PUBLIC_DEV_SHOP_SLUG`)
  - `shopBaseDomain(): string`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/resolve-shop-slug.test.ts`:

```ts
import { resolveShopSlug, shopUrl } from "../../src/features/shops/resolve-slug";

describe("resolveShopSlug", () => {
  it.each([
    ["barbeariadojoao.zencpro.app", "zencpro.app", "barbeariadojoao"],
    ["Barbeariadojoao.ZencPro.app", "zencpro.app", "barbeariadojoao"],
    ["barbeariadojoao.zencpro.app:443", "zencpro.app", "barbeariadojoao"],
    ["shop-a.localhost:8081", "localhost", "shop-a"],
    ["shop-a.localhost", "localhost", "shop-a"],
  ])("%s -> %s", (host, base, slug) => {
    expect(resolveShopSlug(host, base)).toBe(slug);
  });

  it.each([
    ["zencpro.app", "zencpro.app"],
    ["www.zencpro.app", "zencpro.app"],
    ["app.zencpro.app", "zencpro.app"],
    ["login.zencpro.app", "zencpro.app"],
    ["a.b.zencpro.app", "zencpro.app"],
    ["ab.zencpro.app", "zencpro.app"],
    ["-bad.zencpro.app", "zencpro.app"],
    ["example.com", "zencpro.app"],
    ["evilzencpro.app", "zencpro.app"],
    ["localhost:8081", "localhost"],
    ["127.0.0.1:4173", "localhost"],
    ["", "zencpro.app"],
  ])("%s -> null", (host, base) => {
    expect(resolveShopSlug(host, base)).toBeNull();
  });
});

describe("shopUrl", () => {
  it("keeps protocol and port", () => {
    expect(shopUrl("barbeariadojoao", "zencpro.app", { port: "", protocol: "https:" })).toBe("https://barbeariadojoao.zencpro.app/");
    expect(shopUrl("shop-b", "localhost", { port: "8081", protocol: "http:" })).toBe("http://shop-b.localhost:8081/");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/resolve-shop-slug.test.ts`
Expected: FAIL, `Cannot find module '../../src/features/shops/resolve-slug'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/features/shops/resolve-slug.ts`:

```ts
export const RESERVED_SLUGS = [
  "www", "app", "api", "admin", "zenc", "mail", "email", "smtp", "static", "assets", "cdn",
  "docs", "help", "support", "status", "blog", "dev", "staging", "test", "login", "auth",
] as const;

// Same rule as the database check `shops_slug_format`.
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

// "barbeariadojoao.zencpro.app" -> "barbeariadojoao"; the bare domain, reserved names, nested subdomains and other hosts -> null.
export function resolveShopSlug(host: string, baseDomain: string): string | null {
  const hostname = host.trim().toLowerCase().replace(/:\d+$/, "");
  const base = baseDomain.trim().toLowerCase();
  if (!hostname || !base || !hostname.endsWith(`.${base}`)) return null;

  const label = hostname.slice(0, -(base.length + 1));
  if (label.includes(".") || !SLUG_PATTERN.test(label)) return null;

  return (RESERVED_SLUGS as readonly string[]).includes(label) ? null : label;
}

// Where a staff member lands after being sent to their own shop: the shop's origin on the same protocol and port.
export function shopUrl(slug: string, baseDomain: string, location: { port: string; protocol: string }) {
  return `${location.protocol}//${slug}.${baseDomain}${location.port ? `:${location.port}` : ""}/`;
}
```

Create `src/features/shops/host.ts`:

```ts
import { Platform } from "react-native";

import { resolveShopSlug } from "./resolve-slug";

// Expo inlines `process.env.EXPO_PUBLIC_*` only for literal property reads, so each variable is read by name.
export const shopBaseDomain = () => process.env.EXPO_PUBLIC_SHOP_BASE_DOMAIN || "zencpro.app";

// Web: the slug in the host. Native has no host (and ships only after the store launch): development uses a fixed slug.
export function currentShopSlug(): string | null {
  const base = shopBaseDomain();

  if (Platform.OS === "web") return typeof window === "undefined" ? null : resolveShopSlug(window.location.host, base);
  const dev = process.env.EXPO_PUBLIC_DEV_SHOP_SLUG;

  return dev ? resolveShopSlug(`${dev}.${base}`, base) : null;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx jest tests/unit/resolve-shop-slug.test.ts`
Expected: PASS (all rows).

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/shops/resolve-slug.ts src/features/shops/host.ts tests/unit/resolve-shop-slug.test.ts
git commit -m "feat(shops): resolve the shop slug from the host"
```

---

### Task 6: `getShopBySlug` and `CurrentShopProvider`

**Files:**
- Modify: `src/features/shops/api.ts` (`PublicShop` gains `slug`; add `getShopBySlug`; `listPublicShops` selects `slug`)
- Create: `src/features/shops/CurrentShopProvider.tsx`
- Test: `tests/unit/current-shop.test.ts`

**Interfaces:**
- Consumes: `currentShopSlug(): string | null` (Task 5), `useSupabaseSession()` from `src/providers/AppProviders`.
- Produces:
  - `type PublicShop = { address: string | null; id: string; name: string; phone: string | null; slug: string; whatsapp: string | null }`
  - `getShopBySlug(supabase: Pick<SupabaseClient, "from">, slug: string): Promise<PublicShop | null>`
  - `type CurrentShopStatus = "loading" | "ready" | "not-found" | "no-slug" | "error"`
  - `CurrentShopProvider({ children })`, `useCurrentShop(): { shop: PublicShop | null; slug: string | null; status: CurrentShopStatus; retry: () => void }` (throws outside the provider)
  - Query key `["current-shop", slug]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/current-shop.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/api", () => ({ getShopBySlug: jest.fn() }));
jest.mock("../../src/features/shops/host", () => ({ currentShopSlug: jest.fn() }));

import { getShopBySlug } from "../../src/features/shops/api";
import { CurrentShopProvider, useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { currentShopSlug } from "../../src/features/shops/host";

const shop = { address: null, id: "s1", name: "Barbearia Alfa", phone: null, slug: "alfa", whatsapp: null };

function Probe() {
  const value = useCurrentShop();

  return React.createElement(Text, { testID: "probe" }, `${value.status}:${value.slug ?? ""}:${value.shop?.name ?? ""}`);
}

async function renderProvider() {
  // gcTime 0: react-query's default 5-minute GC timer would keep the Jest worker alive.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

  return render(React.createElement(QueryClientProvider, { client }, React.createElement(CurrentShopProvider, null, React.createElement(Probe))));
}

describe("CurrentShopProvider", () => {
  afterEach(() => jest.clearAllMocks());

  it("is loading, then ready with the shop", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("alfa");
    jest.mocked(getShopBySlug).mockResolvedValue(shop);
    const view = await renderProvider();

    expect(view.getByTestId("probe").props.children).toBe("loading:alfa:");
    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("ready:alfa:Barbearia Alfa"));
    expect(getShopBySlug).toHaveBeenCalledWith({}, "alfa");
  });

  it("reports not-found for an unknown slug", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("ghost");
    jest.mocked(getShopBySlug).mockResolvedValue(null);
    const view = await renderProvider();

    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("not-found:ghost:"));
  });

  it("reports no-slug on the bare domain without querying", async () => {
    jest.mocked(currentShopSlug).mockReturnValue(null);
    const view = await renderProvider();

    expect(view.getByTestId("probe").props.children).toBe("no-slug::");
    expect(getShopBySlug).not.toHaveBeenCalled();
  });

  it("reports error when the lookup fails", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("alfa");
    jest.mocked(getShopBySlug).mockRejectedValue(new Error("offline"));
    const view = await renderProvider();

    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("error:alfa:"));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/current-shop.test.ts`
Expected: FAIL, `Cannot find module '../../src/features/shops/CurrentShopProvider'`.

- [ ] **Step 3: Implement**

In `src/features/shops/api.ts` replace the `PublicShop` type and `listPublicShops`, and add `getShopBySlug` after it:

```ts
export type PublicShop = {
  address: string | null;
  id: string;
  name: string;
  phone: string | null;
  slug: string;
  whatsapp: string | null;
};

const PUBLIC_SHOP_COLUMNS = "id, name, slug, address, phone, whatsapp";

export async function listPublicShops(supabase: Pick<SupabaseClient, "from">) {
  const { data, error } = await supabase.from("shops").select(PUBLIC_SHOP_COLUMNS).order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as PublicShop[];
}

// `.limit(1)` and an array (not `.maybeSingle()`): one shop per slug, and the e2e mocks answer with plain arrays.
export async function getShopBySlug(supabase: Pick<SupabaseClient, "from">, slug: string): Promise<PublicShop | null> {
  const { data, error } = await supabase.from("shops").select(PUBLIC_SHOP_COLUMNS).eq("slug", slug).limit(1);

  if (error) throw error;

  return ((data ?? []) as PublicShop[])[0] ?? null;
}
```

Create `src/features/shops/CurrentShopProvider.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";

import { useSupabaseSession } from "../../providers/AppProviders";
import { getShopBySlug } from "./api";
import type { PublicShop } from "./api";
import { currentShopSlug } from "./host";

export type CurrentShopStatus = "loading" | "ready" | "not-found" | "no-slug" | "error";
type CurrentShopValue = { retry: () => void; shop: PublicShop | null; slug: string | null; status: CurrentShopStatus };

const CurrentShopContext = createContext<CurrentShopValue | null>(null);

// The business this page belongs to, found by the slug in the host. Loaded once; everything shop-bound reads it from here.
export function CurrentShopProvider({ children }: PropsWithChildren) {
  const { supabase } = useSupabaseSession();
  const slug = useMemo(() => currentShopSlug(), []);
  const query = useQuery({ enabled: slug !== null, queryFn: () => getShopBySlug(supabase, slug!), queryKey: ["current-shop", slug], retry: false, staleTime: 5 * 60_000 });

  const status: CurrentShopStatus = slug === null ? "no-slug" : query.isError ? "error" : query.isSuccess ? (query.data ? "ready" : "not-found") : "loading";
  const value = useMemo<CurrentShopValue>(() => ({ retry: () => void query.refetch(), shop: query.data ?? null, slug, status }), [query.data, query.refetch, slug, status]);

  return <CurrentShopContext.Provider value={value}>{children}</CurrentShopContext.Provider>;
}

export function useCurrentShop() {
  const value = useContext(CurrentShopContext);

  if (!value) throw new Error("useCurrentShop must be used inside CurrentShopProvider");

  return value;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx jest tests/unit/current-shop.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Fix the type fallout and commit**

`PublicShop` gained a required `slug`, so tests building one need it. Run `npx tsc --noEmit`; add `slug: "alfa"` to the shop literals it reports (`tests/unit/shop-info-card.test.ts:8`, `tests/unit/use-appointment-cards.test.ts:51`).

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npx jest tests/unit/current-shop.test.ts tests/unit/shop-info-card.test.ts tests/unit/use-appointment-cards.test.ts
git add src/features/shops/api.ts src/features/shops/CurrentShopProvider.tsx tests/unit/current-shop.test.ts tests/unit/shop-info-card.test.ts tests/unit/use-appointment-cards.test.ts
git commit -m "feat(shops): CurrentShopProvider loads the shop by slug"
```

---

### Task 7: Staff shop lookup, route decision and the gate screens

**Files:**
- Create: `src/features/shops/my-shop.ts`, `src/features/shops/shop-route.ts`, `src/features/shops/ShopGate.tsx`
- Modify: `src/i18n/locales/en.ts`, `pt.ts`, `es.ts` (new `shopGate` group), `app/(auth)/login.tsx`, `app/(auth)/signup.tsx`
- Test: `tests/unit/shop-route.test.ts`, `tests/unit/my-shop.test.ts`, `tests/unit/shop-gate.test.ts`

**Interfaces:**
- Consumes: `useCurrentShop()` (Task 6), `shopUrl`, `shopBaseDomain` (Task 5), `useSupabaseSession()`.
- Produces:
  - `getMyShop(supabase: Pick<SupabaseClient, "rpc">): Promise<{ shopId: string; slug: string } | null>`
  - `useMyShop(): UseQueryResult<{ shopId: string; slug: string } | null>` (enabled for owner/professional, key `["my-shop", userId]`)
  - `type ShopRoute = { kind: "app" } | { kind: "wait" } | { kind: "not-found" } | { kind: "error" } | { kind: "bare" } | { kind: "redirect"; slug: string }`
  - `resolveShopRoute(input: { currentSlug: string | null; mySlug: string | null | undefined; role: AppRole | null; signedIn: boolean; status: CurrentShopStatus }): ShopRoute`
  - `ShopGate({ children })`.

Decision table (`resolveShopRoute`), evaluated top to bottom:
1. signed-in staff (`owner` or `professional`) and `mySlug === undefined` (still loading) → `wait`.
2. signed-in staff, `mySlug` is a string and `mySlug !== currentSlug` → `redirect(mySlug)` (also covers the bare domain and an unknown host).
3. `status === "loading"` → `wait`.
4. `status === "no-slug"` → signed-in non-staff (a customer) → `bare`; not signed in → `app` (the login screen shows the bare-domain variant).
5. `status === "not-found"` → `not-found`; `status === "error"` → `error`.
6. otherwise `app`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/shop-route.test.ts`:

```ts
import { resolveShopRoute } from "../../src/features/shops/shop-route";

const base = { currentSlug: "alfa", mySlug: null, role: null, signedIn: false, status: "ready" } as const;

describe("resolveShopRoute", () => {
  it.each([
    ["visitor on a shop", base, { kind: "app" }],
    ["visitor, shop loading", { ...base, status: "loading" }, { kind: "wait" }],
    ["visitor, unknown shop", { ...base, status: "not-found" }, { kind: "not-found" }],
    ["visitor, lookup failed", { ...base, status: "error" }, { kind: "error" }],
    ["visitor on the bare domain", { ...base, currentSlug: null, status: "no-slug" }, { kind: "app" }],
    ["customer on the bare domain", { ...base, currentSlug: null, role: "customer", signedIn: true, status: "no-slug" }, { kind: "bare" }],
    ["customer on a shop", { ...base, role: "customer", signedIn: true }, { kind: "app" }],
    ["owner, own shop still loading", { ...base, mySlug: undefined, role: "owner", signedIn: true }, { kind: "wait" }],
    ["owner on own shop", { ...base, mySlug: "alfa", role: "owner", signedIn: true }, { kind: "app" }],
    ["owner of another shop", { ...base, mySlug: "beta", role: "owner", signedIn: true }, { kind: "redirect", slug: "beta" }],
    ["professional on the bare domain", { ...base, currentSlug: null, mySlug: "beta", role: "professional", signedIn: true, status: "no-slug" }, { kind: "redirect", slug: "beta" }],
    ["owner on an unknown shop host", { ...base, mySlug: "beta", role: "owner", signedIn: true, status: "not-found" }, { kind: "redirect", slug: "beta" }],
    ["owner with no shop yet", { ...base, mySlug: null, role: "owner", signedIn: true }, { kind: "app" }],
  ] as const)("%s", (_name, input, expected) => {
    expect(resolveShopRoute(input as never)).toEqual(expected);
  });
});
```

Create `tests/unit/my-shop.test.ts`:

```ts
import { getMyShop } from "../../src/features/shops/my-shop";

describe("getMyShop", () => {
  it("maps the RPC row", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ shop_id: "s1", slug: "alfa" }], error: null });

    await expect(getMyShop({ rpc } as never)).resolves.toEqual({ shopId: "s1", slug: "alfa" });
    expect(rpc).toHaveBeenCalledWith("get_my_shop");
  });

  it("returns null when the account has no staff shop", async () => {
    await expect(getMyShop({ rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } as never)).resolves.toBeNull();
  });

  it("throws the RPC error", async () => {
    await expect(getMyShop({ rpc: jest.fn().mockResolvedValue({ data: null, error: new Error("boom") }) } as never)).rejects.toThrow("boom");
  });
});
```

Create `tests/unit/shop-gate.test.ts`:

```ts
import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }));
jest.mock("../../src/features/shops/my-shop", () => ({ useMyShop: jest.fn() }));

import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { useMyShop } from "../../src/features/shops/my-shop";
import { ShopGate } from "../../src/features/shops/ShopGate";
import i18n from "../../src/i18n";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const child = () => React.createElement(Text, null, "navigator");

function setup(shop: Record<string, unknown>, session: Record<string, unknown>, mine: unknown = { data: null }) {
  jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: null, slug: "alfa", status: "ready", ...shop } as never);
  jest.mocked(useSupabaseSession).mockReturnValue({ profile: null, session: null, ...session } as never);
  jest.mocked(useMyShop).mockReturnValue(mine as never);
}

describe("ShopGate", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("renders the navigator for a ready shop", async () => {
    setup({}, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("navigator")).toBeTruthy();
  });

  it("shows the not-found page for an unknown shop", async () => {
    setup({ status: "not-found" }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Business not found")).toBeTruthy();
    expect(view.queryByText("navigator")).toBeNull();
  });

  it("shows the open-your-link page to a customer on the bare domain", async () => {
    setup({ slug: null, status: "no-slug" }, { profile: { role: "customer" }, session: { user: { id: "u" } } });
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Open the link your business sent you")).toBeTruthy();
  });

  it("lets a signed-out visitor on the bare domain reach the login", async () => {
    setup({ slug: null, status: "no-slug" }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("navigator")).toBeTruthy();
  });

  it("offers a retry when the lookup failed", async () => {
    const retry = jest.fn();
    setup({ retry, status: "error" }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Try again")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/shop-route.test.ts tests/unit/my-shop.test.ts tests/unit/shop-gate.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the pure parts**

Create `src/features/shops/my-shop.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useSupabaseSession } from "../../providers/AppProviders";

export type MyShop = { shopId: string; slug: string };

// The caller's own shop as staff (owner, or the shop a professional works in). `shops.owner_user_id` is not readable by
// clients, so this goes through the security definer RPC get_my_shop (migration 0068).
export async function getMyShop(supabase: Pick<SupabaseClient, "rpc">): Promise<MyShop | null> {
  const { data, error } = await supabase.rpc("get_my_shop");

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { shop_id: string; slug: string } | null | undefined;

  return row ? { shopId: row.shop_id, slug: row.slug } : null;
}

export function useMyShop() {
  const { profile, supabase } = useSupabaseSession();
  const staff = profile?.role === "owner" || profile?.role === "professional";

  return useQuery({ enabled: staff, queryFn: () => getMyShop(supabase), queryKey: ["my-shop", profile?.userId], staleTime: 5 * 60_000 });
}
```

Create `src/features/shops/shop-route.ts`:

```ts
import type { AppRole } from "../auth/types";
import type { CurrentShopStatus } from "./CurrentShopProvider";

export type ShopRoute =
  | { kind: "app" }
  | { kind: "wait" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "bare" }
  | { kind: "redirect"; slug: string };

type Input = {
  currentSlug: string | null;
  // undefined while the staff lookup is loading, null when the account has no staff shop.
  mySlug: string | null | undefined;
  role: AppRole | null;
  signedIn: boolean;
  status: CurrentShopStatus;
};

// Which page a visitor may see on this host. Staff always belong to their own shop's subdomain; customers to the shop in the host.
export function resolveShopRoute({ currentSlug, mySlug, role, signedIn, status }: Input): ShopRoute {
  const staff = signedIn && (role === "owner" || role === "professional");

  if (staff && mySlug === undefined) return { kind: "wait" };
  if (staff && mySlug && mySlug !== currentSlug) return { kind: "redirect", slug: mySlug };
  if (status === "loading") return { kind: "wait" };
  if (status === "no-slug") return signedIn ? { kind: "bare" } : { kind: "app" };
  if (status === "not-found") return { kind: "not-found" };
  if (status === "error") return { kind: "error" };

  return { kind: "app" };
}
```

Note for staff on the bare domain with no staff shop (`mySlug` null) and `signedIn`: row 4 returns `bare`, which is the intended page.

- [ ] **Step 4: Add the texts (pt/es/en) — all three files get a new `shopGate` group next to `layout`**

`src/i18n/locales/en.ts` (after the `layout:` line, same position in `pt.ts` and `es.ts`):

```ts
  shopGate: {
    bareBody: "Zenc works through each business's own link or QR code. Ask your business for it.",
    bareTitle: "Open the link your business sent you",
    errorBody: "We could not load this business.",
    notFoundBody: "Check the link you opened or ask the business for a new one.",
    notFoundTitle: "Business not found",
    staffLoginHint: "Staff: sign in below.",
  },
```

`pt.ts`:

```ts
  shopGate: {
    bareBody: "O Zenc funciona pelo link ou QR code de cada estabelecimento. Peça o seu ao estabelecimento.",
    bareTitle: "Abra o link que o seu estabelecimento enviou",
    errorBody: "Não foi possível carregar este estabelecimento.",
    notFoundBody: "Confira o link que você abriu ou peça um novo ao estabelecimento.",
    notFoundTitle: "Estabelecimento não encontrado",
    staffLoginHint: "Equipe: entre abaixo.",
  },
```

`es.ts`:

```ts
  shopGate: {
    bareBody: "Zenc funciona con el enlace o código QR de cada negocio. Pídelo a tu negocio.",
    bareTitle: "Abre el enlace que te envió tu negocio",
    errorBody: "No pudimos cargar este negocio.",
    notFoundBody: "Revisa el enlace que abriste o pide uno nuevo al negocio.",
    notFoundTitle: "Negocio no encontrado",
    staffLoginHint: "Equipo: ingresa abajo.",
  },
```

- [ ] **Step 5: Implement `ShopGate` and the login/signup variants**

Create `src/features/shops/ShopGate.tsx`:

```tsx
import { useEffect } from "react";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { signOut } from "../auth/api";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "./CurrentShopProvider";
import { shopBaseDomain } from "./host";
import { useMyShop } from "./my-shop";
import { resolveShopRoute } from "./shop-route";
import { shopUrl } from "./resolve-slug";

function Message({ action, body, title }: { action?: { label: string; onPress: () => void }; body: string; title: string }) {
  return (
    <Screen className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center gap-4 p-5">
        <Text accessibilityRole="header" className="max-w-[420px] text-center text-3xl leading-[44px] font-display-bold text-ink">{title}</Text>
        <Text className="max-w-[420px] text-center text-base font-sans text-neutral-600">{body}</Text>
        {action ? <Button label={action.label} onPress={action.onPress} /> : null}
      </View>
    </Screen>
  );
}

// Decides what this host may show before any navigator renders: loading, "business not found", the bare-domain page,
// a retry, or a redirect of staff to their own shop's subdomain. Everything else is the normal app.
export function ShopGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { profile, session, supabase } = useSupabaseSession();
  const { retry, slug, status } = useCurrentShop();
  const mine = useMyShop();
  const staff = profile?.role === "owner" || profile?.role === "professional";
  const route = resolveShopRoute({
    currentSlug: slug,
    // Staff whose lookup failed or has no shop must not hang on the spinner: treat both as "no staff shop".
    mySlug: !staff ? null : mine.isPending ? undefined : mine.data?.slug ?? null,
    role: profile?.role ?? null,
    signedIn: session !== null,
    status,
  });

  useEffect(() => {
    if (route.kind === "redirect" && Platform.OS === "web") window.location.replace(shopUrl(route.slug, shopBaseDomain(), window.location));
  }, [route]);

  if (route.kind === "wait" || route.kind === "redirect") {
    return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator /></View>;
  }
  if (route.kind === "not-found") return <Message body={t("shopGate.notFoundBody")} title={t("shopGate.notFoundTitle")} />;
  if (route.kind === "error") return <Message action={{ label: t("common.tryAgain"), onPress: retry }} body={t("shopGate.errorBody")} title={t("shopGate.notFoundTitle")} />;
  if (route.kind === "bare") {
    return <Message action={{ label: t("common.signOut"), onPress: () => void signOut(supabase) }} body={t("shopGate.bareBody")} title={t("shopGate.bareTitle")} />;
  }

  return <>{children}</>;
}
```

`app/(auth)/login.tsx`: add `import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";`, then inside the component `const bare = useCurrentShop().status === "no-slug";`, show the bare-domain text instead of the subtitle, and hide the create-account button:

```tsx
<Text className="text-base font-sans text-neutral-600">{bare ? `${t("shopGate.bareTitle")}. ${t("shopGate.staffLoginHint")}` : t("auth.login.subtitle")}</Text>
...
{bare ? null : <Button label={t("auth.login.createAccount")} onPress={() => router.push("/signup")} variant="outline" />}
```

`app/(auth)/signup.tsx`: at the top of the component add
`if (useCurrentShop().status === "no-slug") return <Redirect href="/login" />;`
placed **after all hooks** to respect the rules of hooks (call `const { status } = useCurrentShop();` at the top, return the `<Redirect>` just before the main `return`), with imports `Redirect` from `expo-router` and `useCurrentShop`.

- [ ] **Step 6: Run the tests and see them pass**

Run: `npx jest tests/unit/shop-route.test.ts tests/unit/my-shop.test.ts tests/unit/shop-gate.test.ts tests/unit/locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/shops/my-shop.ts src/features/shops/shop-route.ts src/features/shops/ShopGate.tsx src/i18n/locales "app/(auth)/login.tsx" "app/(auth)/signup.tsx" tests/unit/shop-route.test.ts tests/unit/my-shop.test.ts tests/unit/shop-gate.test.ts
git commit -m "feat(shops): shop gate, staff redirect decision and bare-domain page"
```

---

### Task 8: Wire the providers and load the theme by slug

**Files:**
- Modify: `app/_layout.tsx`, `src/features/shops/theme.ts`, `src/features/shops/ShopThemeProvider.tsx`
- Modify tests: `tests/unit/shop-theme.test.ts`, `tests/unit/shop-theme-provider.test.ts`, `tests/unit/root-layout.test.ts`

**Interfaces:**
- Consumes: `useCurrentShop()` (`slug`), `ShopGate` (Task 7).
- Produces: `getShopTheme(supabase, slug: string): Promise<{ input: ShopThemeValues; shopId: string } | null>` (filters `.eq("slug", slug)`), `readCachedTheme(slug)`, `writeCachedTheme(slug, input)` (storage key `zenc.shop-theme.<slug>`), `useShopTheme()` enabled by slug instead of signed-in user.

- [ ] **Step 1: Update the failing tests first**

In `tests/unit/shop-theme.test.ts`:
- `getShopTheme(client)` becomes `getShopTheme(client, "alfa")` (3 calls: lines ~66, ~72, ~76) and add to the first test `expect(builder.eq).toHaveBeenCalledWith("slug", "alfa")` (use the fake client's recorded calls like the file's other assertions; if the fake has no `eq`, add one to `fakeClient` that records and returns the builder).
- The cache tests use `readCachedTheme("u1")`/`writeCachedTheme("u1", …)`: rename the argument to slugs (`"alfa"`, `"beta"`) and the expected storage key to `zenc.shop-theme.alfa`.

In `tests/unit/root-layout.test.ts` (it renders `RootNavigator` with everything around it mocked): add `jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ CurrentShopProvider: ({ children }: { children: unknown }) => children }))` and `jest.mock("../../src/features/shops/ShopGate", () => ({ ShopGate: ({ children }: { children: unknown }) => children }))` next to the existing `ShopThemeProvider` mock, so the existing assertions about the loading screen and the stack keep meaning what they meant.

In `tests/unit/shop-theme-provider.test.ts`: mock `../../src/features/shops/CurrentShopProvider` (`useCurrentShop: jest.fn()`) returning `{ slug: "alfa", status: "ready", shop: null, retry: jest.fn() }`; the "no user → ready immediately" case becomes "no slug → ready immediately" (`slug: null`); assert the theme query is called with `(supabase, "alfa")` and the cache is read with `"alfa"`, and add a case "a signed-out visitor still gets the shop colours" (session null, slug `alfa`, `fetchTheme` resolves colours → `useColors()` returns them).

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/shop-theme.test.ts tests/unit/shop-theme-provider.test.ts`
Expected: FAIL (wrong arguments / theme not loaded without a session).

- [ ] **Step 3: Implement**

`src/features/shops/theme.ts`:

```ts
export async function getShopTheme(supabase: Pick<SupabaseClient, "from">, slug: string): Promise<{ input: ShopThemeValues; shopId: string } | null> {
  const { data, error } = await supabase.from("shops").select("id, theme_primary, theme_accent, theme_base").eq("slug", slug).limit(1);

  if (error) throw error;
  const shop = (data as Array<{ id: string; theme_accent: string | null; theme_base: string | null; theme_primary: string | null }> | null)?.[0];

  return shop ? { input: { accent: shop.theme_accent, base: shop.theme_base, primary: shop.theme_primary }, shopId: shop.id } : null;
}

const cacheKey = (slug: string) => `zenc.shop-theme.${slug}`;

export async function readCachedTheme(slug: string): Promise<ThemeInput | null> { /* body unchanged, using cacheKey(slug) */ }
export async function writeCachedTheme(slug: string, input: ThemeInput) { /* body unchanged, using cacheKey(slug) */ }
```

(Also delete the comment "Single-shop MVP, like the other shop screens: the first shop is the current one.")

`src/features/shops/ShopThemeProvider.tsx`: in `useShopTheme`, replace

```ts
const { session, supabase } = useSupabaseSession();
const userId = session?.user.id ?? null;
```

with

```ts
const { supabase } = useSupabaseSession();
const { slug } = useCurrentShop();
```

and rename every `userId` in the hook to `slug` (query `enabled: Boolean(slug)`, `queryFn: () => getShopTheme(supabase, slug!)`, `queryKey: ["shop-theme", slug]`, the cache effect, the write effect, the timeout effect, and `isReady: !slug || answered || timedOut || (cache.loaded && cache.value !== null)`). Update the doc comment: "The current shop's colours, available to signed-out visitors too."

`app/_layout.tsx`: import `CurrentShopProvider` and `ShopGate`; in `RootLayout` nest `<AppProviders><CurrentShopProvider><ShopThemeProvider><RootNavigator /></ShopThemeProvider></CurrentShopProvider></AppProviders>`, and in `RootNavigator` wrap the stack: `<ThemeProvider value={navigationTheme}><ShopGate><Stack screenOptions={{ headerShown: false }} /></ShopGate></ThemeProvider>`.

- [ ] **Step 4: Run and see them pass**

Run: `npx jest tests/unit/shop-theme.test.ts tests/unit/shop-theme-provider.test.ts tests/unit/current-shop.test.ts tests/unit/root-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add app/_layout.tsx src/features/shops/theme.ts src/features/shops/ShopThemeProvider.tsx tests/unit/shop-theme.test.ts tests/unit/shop-theme-provider.test.ts tests/unit/root-layout.test.ts
git commit -m "feat(shops): wire the shop gate and load the theme by slug"
```

---

### Task 9: Staff side reads their own shop (`getOwnerShopId`, owner Shop screen)

**Files:**
- Modify: `src/features/shops/use-owner-shop-id.ts`, `app/(owner)/shop.tsx`
- Test: `tests/unit/owner-shop-id.test.ts`

**Interfaces:**
- Consumes: `getMyShop` (Task 7), `useCurrentShop()` (Task 6).
- Produces: `getOwnerShopId(supabase: Pick<SupabaseClient, "rpc">): Promise<string | null>` (now via the RPC; hook `useOwnerShopId()` unchanged for its 15 callers).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/owner-shop-id.test.ts`:

```ts
import { getOwnerShopId } from "../../src/features/shops/use-owner-shop-id";

describe("getOwnerShopId", () => {
  it("returns the caller's own shop, never the first shop by name", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ shop_id: "shop-b", slug: "beta" }], error: null });

    await expect(getOwnerShopId({ rpc } as never)).resolves.toBe("shop-b");
    expect(rpc).toHaveBeenCalledWith("get_my_shop");
  });

  it("returns null when the owner has no shop yet", async () => {
    await expect(getOwnerShopId({ rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } as never)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/owner-shop-id.test.ts`
Expected: FAIL (`supabase.from is not a function`).

- [ ] **Step 3: Implement**

Replace `getOwnerShopId` in `src/features/shops/use-owner-shop-id.ts`:

```ts
import { getMyShop } from "./my-shop";

// `get_my_shop` (security definer) replaces the old "first row of `shops`", which picked the alphabetically first business for
// every owner once a second shop existed.
export async function getOwnerShopId(supabase: Pick<SupabaseClient, "rpc">): Promise<string | null> {
  return (await getMyShop(supabase))?.shopId ?? null;
}
```

and fix the comment above `useOwnerShopId` ("RLS limits `shops` to their own" is wrong: it is the RPC). In `app/(owner)/shop.tsx` replace

```ts
const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
const shop = shops.data?.[0];
```

with

```ts
const { shop } = useCurrentShop();
```

(import `useCurrentShop`; drop `listPublicShops` from the imports; after saving, `await queryClient.invalidateQueries({ queryKey: ["current-shop"] })` instead of `["public-shops"]`). The owner is always on their own subdomain here: `ShopGate` redirects any other host.

- [ ] **Step 4: Run and see it pass; fix fallout**

Run: `npx jest tests/unit/owner-shop-id.test.ts` then `npx tsc --noEmit` (owner screens that mock `getOwnerShopId` with `from` need `rpc`; grep `getOwnerShopId` in `tests/` returned nothing, so none expected).

- [ ] **Step 5: Commit**

```bash
./node_modules/.bin/eslint app src tests scripts
git add src/features/shops/use-owner-shop-id.ts "app/(owner)/shop.tsx" tests/unit/owner-shop-id.test.ts
git commit -m "fix(shops): the owner's shop comes from get_my_shop, not the first row"
```

---

### Task 10: Customer side reads the current shop

**Files:**
- Modify: `src/features/shops/use-shop-info.ts`, `src/features/appointments/use-appointment-cards.ts`, `app/(customer)/(tabs)/book/index.tsx`, `app/(customer)/me/recurrence.tsx`
- Modify tests: `tests/unit/use-appointment-cards.test.ts`; Create: `tests/unit/use-shop-info.test.ts`

**Interfaces:**
- Consumes: `useCurrentShop()` (Task 6), `listShopHours`, `listPublicProfessionals` (existing).
- Produces: `useShopInfo(): { hours: ShopPeriod[]; shop: PublicShop | undefined }` (same shape, current shop), `useAppointmentCards` unchanged signature (shop name from the current shop).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/use-shop-info.test.ts`:

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/api", () => ({ listShopHours: jest.fn() }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }));

import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { listShopHours } from "../../src/features/shops/api";
import { useShopInfo } from "../../src/features/shops/use-shop-info";

function Probe() {
  const { hours, shop } = useShopInfo();

  return React.createElement(Text, { testID: "probe" }, `${shop?.name ?? "none"}:${hours.length}`);
}

it("returns the current shop and its hours, not the first shop by name", async () => {
  jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: { id: "s2", name: "Beta", slug: "beta" }, slug: "beta", status: "ready" } as never);
  jest.mocked(listShopHours).mockResolvedValue([{ end: "18:00", start: "09:00", weekday: 1 }]);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const view = await render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));

  await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("Beta:1"));
  expect(listShopHours).toHaveBeenCalledWith({}, "s2");
});
```

In `tests/unit/use-appointment-cards.test.ts`: replace the `listPublicShops` mock with a `useCurrentShop` mock (`jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }))` returning `{ shop: { id: "s1", name: "Barbearia Alfa", slug: "alfa" } }`), drop `listPublicShops` from the `../../src/features/shops/api` mock factory and the import, and keep the existing expectations (`shopName` is `"Barbearia Alfa"`; the fallback case now uses `shop: null`).

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/use-shop-info.test.ts tests/unit/use-appointment-cards.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`src/features/shops/use-shop-info.ts`:

```ts
import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listShopHours } from "./api";
import { useCurrentShop } from "./CurrentShopProvider";

// The business of the current subdomain and its opening hours.
export function useShopInfo() {
  const { supabase } = useSupabaseSession();
  const { shop } = useCurrentShop();
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });

  return { hours: hours.data ?? [], shop: shop ?? undefined };
}
```

`src/features/appointments/use-appointment-cards.ts`: remove the `listPublicShops`/`useQuery(shops)` lines and the "Single-shop MVP" comment; `const { shop } = useCurrentShop();` then `const shopId = shop?.id ?? "";` (appointments are filtered to the current shop in Task 11, so every row belongs to it) and `shopName: shop?.name ?? t("appointments.fallbackShop")`.

`app/(customer)/(tabs)/book/index.tsx`: the screen becomes a redirect with a loading skeleton:

```tsx
export default function BookIndexScreen() {
  const { shop } = useCurrentShop();

  if (shop) return <Redirect href={`/book/professional?shopId=${encodeURIComponent(shop.id)}`} />;

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <SkeletonBlock height={60} width={320} />
      </View>
    </Screen>
  );
}
```

(remove the unused imports: `useQuery`, `useRouter`, `useTranslation`, `Text`, `EmptyState`, `Button`, `listPublicShops`, `useSupabaseSession`; the `book.shopTitle`, `book.shopsError`, `book.noShops`, `book.startAt` keys become unused: leave them, `locale-parity` still passes.)

`app/(customer)/me/recurrence.tsx` lines 71 and 72: replace

```ts
const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
const shopId = shops.data?.[0]?.id ?? "";
```

with `const shopId = useCurrentShop().shop?.id ?? "";` (drop the `listPublicShops` import).

- [ ] **Step 4: Run and see them pass**

Run: `npx jest tests/unit/use-shop-info.test.ts tests/unit/use-appointment-cards.test.ts tests/unit/shop-info-card.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/shops/use-shop-info.ts src/features/appointments/use-appointment-cards.ts "app/(customer)/(tabs)/book/index.tsx" "app/(customer)/me/recurrence.tsx" tests/unit/use-shop-info.test.ts tests/unit/use-appointment-cards.test.ts
git commit -m "feat(customer): the booking pages read the current shop"
```

---

### Task 11: Customer bootstrap and shop-scoped lists

**Files:**
- Modify: `src/features/account/api.ts` (`ensureMyCustomer`), `src/features/customers/api.ts` (`listMyCustomers`), `src/features/appointments/lifecycle.ts` (`listMyAppointments`), `src/features/recurrence/requests-api.ts` (`listMyRecurrenceRequests`), `src/features/notifications/inbox-api.ts` (`listNotifications`, `countUnread`)
- Modify callers: `app/(customer)/_layout.tsx`, `app/(customer)/(tabs)/home.tsx`, `appointments.tsx`, `profile.tsx`, `book/review.tsx`, `app/(customer)/me/account.tsx`, `me/recurrence.tsx`, `reschedule.tsx`, `src/features/notifications/NotificationsScreen.tsx`, `use-unread.ts`
- Modify tests that call the changed signatures: `tests/integration/account.test.ts` (`ensureMyCustomer`), `tests/unit/list-my-appointments.test.ts` (`listMyAppointments`), `tests/unit/inbox.test.ts` and `tests/unit/payout-inbox.test.ts` (`listNotifications`, `countUnread`); `grep -rln "listMyAppointments\|listMyCustomers\|listMyRecurrenceRequests\|listNotifications\|countUnread\|ensureMyCustomer" tests` must end up listing only files that pass the shop id. Create: `tests/integration/shop-scoped-lists.test.ts`

**Interfaces:**
- Consumes: `useCurrentShop()` (Task 6).
- Produces (all `shopId` arguments are required for customers):
  - `ensureMyCustomer(supabase, shopId: string)` → `rpc("ensure_my_customer", { p_shop_id: shopId })`
  - `listMyCustomers(supabase, shopId: string)` → `.eq("shop_id", shopId)`
  - `listMyAppointments(supabase, shopId: string, history = false, now = new Date(), range?)` → `.eq("shop_id", shopId)` (**shopId is the new second parameter**)
  - `listMyRecurrenceRequests(supabase, shopId: string)` → `rpc("list_my_recurrence_requests", { p_shop_id: shopId })`
  - `listNotifications(supabase, shopId: string, limit = 50)` and `countUnread(supabase, shopId: string)` → `.or(\`shop_id.eq.${shopId},shop_id.is.null\`)`
  - Query keys gain the shop id (`["my-appointments", shopId, "upcoming"]`, `["my-customers", shopId]`, `["my-recurrence-requests", shopId]`, `["notifications", userId, shopId]`, `["notifications-unread", userId, shopId]`, `["ensure-my-customer", userId, shopId]`).

- [ ] **Step 1: Write the failing tests**

Create `tests/integration/shop-scoped-lists.test.ts`:

```ts
import { ensureMyCustomer } from "../../src/features/account/api";
import { listMyCustomers } from "../../src/features/customers/api";
import { listMyAppointments } from "../../src/features/appointments/lifecycle";
import { listMyRecurrenceRequests } from "../../src/features/recurrence/requests-api";
import { countUnread, listNotifications } from "../../src/features/notifications/inbox-api";

// A thenable query builder that records the calls the code makes on it.
function builder(result: unknown = { data: [], error: null, count: 0 }) {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: Record<string, unknown> = new Proxy({}, {
    get: (_target, name: string) => {
      if (name === "then") return (resolve: (value: unknown) => void) => resolve(result);

      return (...args: unknown[]) => { calls.push([name, args]); return proxy; };
    },
  });

  return { calls, client: { from: jest.fn(() => proxy), rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } };
}

describe("shop-scoped customer reads", () => {
  it("ensureMyCustomer passes the shop", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { id: "c1", shop_id: "s1", user_id: "u1", full_name: "A", email: null, phone: null, active: true, archived_at: null }, error: null });
    await ensureMyCustomer({ rpc } as never, "s1");

    expect(rpc).toHaveBeenCalledWith("ensure_my_customer", { p_shop_id: "s1" });
  });

  it("listMyCustomers filters by shop", async () => {
    const { calls, client } = builder();
    await listMyCustomers(client as never, "s1");

    expect(calls).toContainEqual(["eq", ["shop_id", "s1"]]);
  });

  it("listMyAppointments filters by shop", async () => {
    const { calls, client } = builder();
    await listMyAppointments(client as never, "s1");

    expect(calls).toContainEqual(["eq", ["shop_id", "s1"]]);
  });

  it("listMyRecurrenceRequests passes the shop", async () => {
    const { client } = builder();
    await listMyRecurrenceRequests(client as never, "s1");

    expect(client.rpc).toHaveBeenCalledWith("list_my_recurrence_requests", { p_shop_id: "s1" });
  });

  it("notifications include the shop's rows and the unscoped ones", async () => {
    const { calls, client } = builder();
    await listNotifications(client as never, "s1");

    expect(calls).toContainEqual(["or", ["shop_id.eq.s1,shop_id.is.null"]]);
  });

  it("the unread count uses the same scope", async () => {
    const { calls, client } = builder({ count: 3, error: null });
    await countUnread(client as never, "s1");

    expect(calls).toContainEqual(["or", ["shop_id.eq.s1,shop_id.is.null"]]);
  });
});
```

Update the existing tests that call these functions with the old signatures (`tests/integration/account.test.ts:24` expects `toHaveBeenCalledWith("ensure_my_customer")` → `("ensure_my_customer", { p_shop_id: "s1" })` and the calls become `ensureMyCustomer({ rpc } as never, "s1")`; in `list-my-appointments.test.ts`, `inbox.test.ts` and `payout-inbox.test.ts` insert the `"s1"` argument in each call, and where they assert the builder calls, expect the extra `eq("shop_id", "s1")` / `or("shop_id.eq.s1,shop_id.is.null")`).

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/integration/shop-scoped-lists.test.ts tests/integration/account.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the API changes**

`src/features/account/api.ts:30`:

```ts
export async function ensureMyCustomer(supabase: RpcClient, shopId: string) {
  return toCustomer((await callRpc(supabase, "ensure_my_customer", { p_shop_id: shopId })) as CustomerRow);
}
```

(adapt `callRpc` to accept the optional args object if it does not already; check its signature in the same file and reuse it.)

`src/features/customers/api.ts`:

```ts
export async function listMyCustomers(supabase: CustomerSupabaseClient, shopId: string) {
  const { data, error } = await supabase
    .from("customers")
    .select(customerColumns)
    .eq("shop_id", shopId)
    .order("full_name", { ascending: true });
```

`src/features/appointments/lifecycle.ts`:

```ts
export async function listMyAppointments(
  supabase: Pick<LifecycleSupabaseClient, "from">,
  shopId: string,
  history = false,
  now = new Date(),
  range?: { from: number; to: number },
): Promise<Appointment[]> {
  const nowIso = now.toISOString();
  const query = supabase.from("appointments").select(appointmentColumns).eq("shop_id", shopId);
```

`src/features/recurrence/requests-api.ts:86`: `listMyRecurrenceRequests(supabase: Client, shopId: string)` and `const rows = await call(supabase, "list_my_recurrence_requests", { p_shop_id: shopId });` (check `call`'s signature and extend it the same way if it takes no args).

`src/features/notifications/inbox-api.ts`: `listNotifications(supabase, shopId, limit = 50)` adds `.or(\`shop_id.eq.${shopId},shop_id.is.null\`)` before `.order(...)`; `countUnread(supabase, shopId)` adds the same `.or(...)` to its query (read the function first: it is a `from("notifications")` count query).

- [ ] **Step 4: Update the callers**

Each customer screen/hook gets `const shopId = useCurrentShop().shop?.id ?? "";`, `enabled: Boolean(shopId)` on the queries and the id in the query key:
- `app/(customer)/_layout.tsx`: `ensureMyCustomer(supabase, shopId!)`, `enabled: profile?.role === "customer" && Boolean(shopId)`, key `["ensure-my-customer", profile?.userId, shopId]`.
- `home.tsx`, `appointments.tsx`, `reschedule.tsx`: `listMyAppointments(supabase, shopId)` (history call: `listMyAppointments(supabase, shopId, true, new Date(), { from: pageParam, to: pageParam + HISTORY_PAGE_SIZE - 1 })`), keys `["my-appointments", shopId, "upcoming"]` / the history key likewise. `grep -rn '"my-appointments"' app src` and update every `invalidateQueries` to still match by prefix (prefix `["my-appointments"]` keeps working, so only fix keys that pass the full array).
- `home.tsx`, `profile.tsx`, `book/review.tsx`, `me/account.tsx`: `listMyCustomers(supabase, shopId)`, key `["my-customers", shopId]` (the `invalidateQueries({ queryKey: ["my-customers"] })` in `account.tsx:59` still matches by prefix).
- `me/recurrence.tsx`: `listMyRecurrenceRequests(supabase, shopId)`, key `["my-recurrence-requests", shopId]`.
- `NotificationsScreen.tsx:43` and `use-unread.ts`: add the shop id (from `useCurrentShop()`); on the **staff** screens (owner/professional notifications reuse `NotificationsScreen`) the shop is also the current one, because staff are always on their own subdomain.

- [ ] **Step 5: Run and see them pass**

Run: `npx jest tests/integration tests/unit/use-appointment-cards.test.ts` then `npx tsc --noEmit` (it reports every missed caller).
Expected: PASS and 0 type errors.

- [ ] **Step 6: Commit**

```bash
./node_modules/.bin/eslint app src tests scripts
git add -A src app tests/integration tests/unit
git commit -m "feat(customer): one customer row per shop and shop-scoped lists"
```

(`git add -A src app tests/...` is safe here: only files from this task changed; run `git status --short` first and stop if anything else shows.)

---

### Task 12: Shared login across subdomains (cookie session) — implement the path chosen in Task 1

**Files:**
- Modify: `src/lib/supabase/client.ts`, `.env.example`
- Path B only: Create `src/lib/supabase/cookie-storage.ts`, Test `tests/unit/cookie-storage.test.ts`
- Path A only: `package.json`, `package-lock.json` (+`@supabase/ssr`)
- Test (both): extend `tests/unit/task1-review-fixes.test.ts`

**Interfaces:**
- Produces: `getSupabaseBrowserClient()` whose web session lives in cookies (domain from `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`, undefined = host-only); native unchanged. `buildSupabaseAuthOptions(platform, webStorage)` keeps its signature; with an injected `webStorage` it still uses it (existing test).

Read `docs/superpowers/spikes/2026-11-18-cookie-session.md`. **Execute only the matching sub-section.**

#### Path B — hand-written chunked cookie storage (default)

- [ ] **Step B1: Write the failing test**

Create `tests/unit/cookie-storage.test.ts`:

```ts
import { createCookieStorage } from "../../src/lib/supabase/cookie-storage";

// A tiny in-memory document.cookie: remembers name -> value, honours Max-Age=0 as deletion.
function fakeJar() {
  const cookies = new Map<string, string>();
  const writes: string[] = [];

  return {
    cookies,
    jar: {
      read: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      write: (cookie: string) => {
        writes.push(cookie);
        const [pair, ...attributes] = cookie.split("; ");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);

        if (attributes.includes("Max-Age=0")) cookies.delete(name);
        else cookies.set(name, pair.slice(index + 1));
      },
    },
    writes,
  };
}

const long = JSON.stringify({ access_token: "a".repeat(5000), refresh_token: "r".repeat(100), user: { name: "João ✂️" } });

describe("createCookieStorage", () => {
  it("round-trips a value larger than one cookie through numbered chunks", async () => {
    const { cookies, jar } = fakeJar();
    const storage = createCookieStorage(jar, { secure: true });

    await storage.setItem("sb-x-auth-token", long);

    expect([...cookies.keys()].sort()).toEqual(["sb-x-auth-token.0", "sb-x-auth-token.1", "sb-x-auth-token.2"]);
    for (const value of cookies.values()) expect(value.length).toBeLessThanOrEqual(3000);
    await expect(storage.getItem("sb-x-auth-token")).resolves.toBe(long);
  });

  it("writes Secure, SameSite=Lax, Path and the shared domain", async () => {
    const { jar, writes } = fakeJar();
    await createCookieStorage(jar, { domain: ".zencpro.app", secure: true }).setItem("k", "v");

    expect(writes[0]).toContain("Path=/");
    expect(writes[0]).toContain("SameSite=Lax");
    expect(writes[0]).toContain("Secure");
    expect(writes[0]).toContain("Domain=.zencpro.app");
  });

  it("omits Domain and Secure for host-only development cookies", async () => {
    const { jar, writes } = fakeJar();
    await createCookieStorage(jar, { secure: false }).setItem("k", "v");

    expect(writes[0]).not.toContain("Domain");
    expect(writes[0]).not.toContain("Secure");
  });

  it("drops stale higher chunks when a shorter value is saved", async () => {
    const { cookies, jar } = fakeJar();
    const storage = createCookieStorage(jar, { secure: true });

    await storage.setItem("k", long);
    await storage.setItem("k", "short");

    expect([...cookies.keys()]).toEqual(["k.0"]);
    await expect(storage.getItem("k")).resolves.toBe("short");
  });

  it("removes every chunk", async () => {
    const { cookies, jar } = fakeJar();
    const storage = createCookieStorage(jar, { secure: true });

    await storage.setItem("k", long);
    await storage.removeItem("k");

    expect(cookies.size).toBe(0);
    await expect(storage.getItem("k")).resolves.toBeNull();
  });

  it("reads a session a previous version left in localStorage, then moves it to cookies on the next write", async () => {
    const { cookies, jar } = fakeJar();
    const legacy = { getItem: jest.fn().mockReturnValue("old-session"), removeItem: jest.fn() };
    const storage = createCookieStorage(jar, { legacy, secure: true });

    await expect(storage.getItem("k")).resolves.toBe("old-session");
    await storage.setItem("k", "new-session");

    expect(cookies.get("k.0")).toBe("new-session");
    expect(legacy.removeItem).toHaveBeenCalledWith("k");
  });
});
```

- [ ] **Step B2: Run it and watch it fail**

Run: `npx jest tests/unit/cookie-storage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step B3: Implement**

Create `src/lib/supabase/cookie-storage.ts`:

```ts
// Session storage for supabase-js on web: the session lives in cookies, so a login on one shop subdomain is valid on the others
// (cookie Domain = ".zencpro.app"). A session is larger than one cookie (~4 KB), so it is split into numbered chunks
// "<key>.0", "<key>.1", ...; each chunk is URL-encoded and kept under CHUNK_LENGTH characters.
const CHUNK_LENGTH = 3000;
const MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookie lifetime at 400 days

export type CookieJar = { read: () => string; write: (cookie: string) => void };
type LegacyStorage = Pick<Storage, "getItem" | "removeItem">;
type Options = { domain?: string; legacy?: LegacyStorage | null; secure: boolean };

function splitEncoded(value: string): string[] {
  const chunks: string[] = [];
  let current = "";

  // `for...of` walks code points, so a surrogate pair is never cut in half.
  for (const char of value) {
    const encoded = encodeURIComponent(char);

    if (current.length + encoded.length > CHUNK_LENGTH) {
      chunks.push(current);
      current = "";
    }
    current += encoded;
  }
  chunks.push(current);

  return chunks;
}

export function createCookieStorage(jar: CookieJar, { domain, legacy = null, secure }: Options) {
  const attributes = (maxAge: number) => ["Path=/", "SameSite=Lax", `Max-Age=${maxAge}`, ...(domain ? [`Domain=${domain}`] : []), ...(secure ? ["Secure"] : [])].join("; ");
  const readAll = () => new Map(jar.read().split("; ").filter(Boolean).map((part): [string, string] => { const i = part.indexOf("="); return [part.slice(0, i), part.slice(i + 1)]; }));
  const chunkNames = (key: string) => [...readAll().keys()].filter((name) => name.startsWith(`${key}.`));
  const clearCookies = (key: string) => chunkNames(key).forEach((name) => jar.write(`${name}=; ${attributes(0)}`));

  return {
    async getItem(key: string): Promise<string | null> {
      const all = readAll();
      const parts: string[] = [];

      for (let index = 0; all.has(`${key}.${index}`); index += 1) parts.push(all.get(`${key}.${index}`)!);

      return parts.length > 0 ? decodeURIComponent(parts.join("")) : (legacy?.getItem(key) ?? null);
    },
    async removeItem(key: string): Promise<void> {
      clearCookies(key);
      legacy?.removeItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      clearCookies(key);
      splitEncoded(value).forEach((chunk, index) => jar.write(`${key}.${index}=${chunk}; ${attributes(MAX_AGE)}`));
      legacy?.removeItem(key);
    },
  };
}

export function createBrowserCookieStorage() {
  const domain = process.env.EXPO_PUBLIC_AUTH_COOKIE_DOMAIN || undefined;
  const legacy = typeof localStorage === "undefined" ? null : localStorage;

  return createCookieStorage(
    { read: () => document.cookie, write: (cookie) => { document.cookie = cookie; } },
    { domain, legacy, secure: window.location.protocol === "https:" },
  );
}
```

In `src/lib/supabase/client.ts` change `buildSupabaseAuthOptions` so the web default is the cookie storage while an injected `webStorage` (existing test, `localStorage` mock) still wins:

```ts
import { createBrowserCookieStorage } from "./cookie-storage";

export function buildSupabaseAuthOptions(platform: PlatformOSType = Platform.OS, webStorage?: WebStorage) {
  return {
    autoRefreshToken: true,
    detectSessionInUrl: platform === "web",
    persistSession: true,
    storage: platform === "web" && !webStorage && typeof document !== "undefined" ? createBrowserCookieStorage() : createKeyValueStorage(platform, webStorage),
  };
}
```

- [ ] **Step B4: Run and see it pass; add the auth-option test**

Add to `tests/unit/task1-review-fixes.test.ts` (inside its `describe`):

```ts
it("uses the cookie storage on web when no storage is injected", () => {
  const auth = buildSupabaseAuthOptions("web");

  expect(auth.storage).not.toBe(undefined);
  expect(auth.detectSessionInUrl).toBe(true);
});
```

Run: `npx jest tests/unit/cookie-storage.test.ts tests/unit/task1-review-fixes.test.ts`
Expected: PASS.

#### Path A — `@supabase/ssr` (only if the spike chose it)

- [ ] **Step A1:** `npm i @supabase/ssr` (exact version from the spike note), then in `getSupabaseBrowserClient` use the web branch proven in the spike (`createBrowserClient(url, publishableKey, { auth: { flowType: "implicit" }, cookieOptions: { domain: process.env.EXPO_PUBLIC_AUTH_COOKIE_DOMAIN || undefined, maxAge: 34560000, sameSite: "lax", secure: window.location.protocol === "https:" } })`), native stays `createClient(url, publishableKey, { auth: buildSupabaseAuthOptions() })`.
- [ ] **Step A2:** add a Jest test mocking `@supabase/ssr` that asserts the web branch passes `cookieOptions.domain` from the env var and `flowType: "implicit"`.
- [ ] **Step A3:** add the e2e session helper and the 36-spec edit described in Task 14 (Path A branch).

#### Both paths

- [ ] **Step 5: Document the environment variables**

Append to `.env.example`:

```
# Multi-shop: base domain the shop slug is read from (zencpro.app in production, localhost in development).
EXPO_PUBLIC_SHOP_BASE_DOMAIN=localhost
# Shared login across shop subdomains (leave unset in development: cookies are then per host).
EXPO_PUBLIC_AUTH_COOKIE_DOMAIN=
# Native (Expo Go) has no host: which shop to show in development.
EXPO_PUBLIC_DEV_SHOP_SLUG=seed-shop
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npx jest tests/unit
git add src/lib/supabase .env.example tests/unit
git commit -m "feat(auth): web session in cookies shared across shop subdomains"
```

---

### Task 13: Auth e-mail links land on the right subdomain

**Files:**
- Modify: `src/features/auth/api.ts` (`signUpCustomer`), `app/(auth)/signup.tsx` (caller), `supabase/config.toml:43`
- Modify tests: `tests/integration/signup.test.ts` / `tests/integration/auth.test.ts` (whichever asserts `signUp` options; `grep -n "signUp" tests/integration/*.ts`)

**Interfaces:**
- Produces: `signUpCustomer(supabase, input, redirectTo: string)` passing `options.emailRedirectTo = redirectTo`.

- [ ] **Step 1: Write the failing test**

In the existing signup test file add (adapting the fake client the file already uses):

```ts
it("sends the confirmation link back to the current origin", async () => {
  const signUp = jest.fn().mockResolvedValue({ data: { session: null }, error: null });

  await signUpCustomer({ auth: { signUp } } as never, { email: "a@b.co", fullName: "A", password: "12345678" } as never, "https://alfa.zencpro.app/");

  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: "https://alfa.zencpro.app/" }) }));
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/integration -t "confirmation link"`
Expected: FAIL (`emailRedirectTo` undefined).

- [ ] **Step 3: Implement**

`src/features/auth/api.ts`: `signUpCustomer(supabase, input, redirectTo: string)` and `options: { data: { ... }, emailRedirectTo: redirectTo }`. In `app/(auth)/signup.tsx` pass `Linking.createURL("/")` (import `* as Linking from "expo-linking"`; on web this is the current origin, exactly what `forgot-password.tsx:29` does for the reset link).

`supabase/config.toml` line 43: add `"http://*.localhost:8081/**"` and `"http://*.localhost:4173/**"` to `additional_redirect_urls` (keep the existing entries). Reset local auth config: `npx supabase stop && npx supabase start` is needed for config changes (mention in the commit body).

- [ ] **Step 4: Run and see it pass**

Run: `npx jest tests/integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/auth/api.ts "app/(auth)/signup.tsx" supabase/config.toml tests/integration
git commit -m "feat(auth): signup confirmation returns to the shop the user came from"
```

---

### Task 14: E2E — shop hosts, the slug-lookup fixture and a two-shop spec

**Files:**
- Modify: `src/lib/testing/e2e-web.ts` (base URL), `playwright.config.ts`, `package.json` (`e2e:export`, `e2e:serve` hosts), `scripts/run-e2e-web.mjs` (env), `tests/unit/task1-review-fixes.test.ts` (expected base URL)
- Create: `tests/e2e/fixtures.ts`, `tests/e2e/multi-shop.web.spec.ts`
- Modify (mechanical): every `tests/e2e/*.spec.ts` changes its first import line `import { expect, test } from "@playwright/test";` to `import { expect, test } from "./fixtures";`
- Path A only: Create `tests/e2e/seed-session.ts` and edit the 36 specs (below)

**Interfaces:**
- Produces: `getE2EWebBaseUrl(port)` = `http://shop-a.localhost:<port>`; Playwright `test` with an option fixture `shop` (default `{ id: "11111111-1111-4111-8111-111111111111", name: "Shop", slug: "shop-a", address: null, phone: null, whatsapp: null, theme_primary: null, theme_accent: null, theme_base: null }`) that answers `GET …/rest/v1/shops?…slug=eq.…` for every spec.

- [ ] **Step 1: Write the failing assertions first**

In `tests/unit/task1-review-fixes.test.ts`, update the existing base-URL expectation to `"http://shop-a.localhost:4173"` (`grep -n "127.0.0.1" tests/unit/task1-review-fixes.test.ts`). Create `tests/e2e/multi-shop.web.spec.ts`:

```ts
import { expect, test } from "./fixtures";

import { customerRow, json, signInAsCustomer } from "./customer-helpers";

const shopB = { id: "99999999-9999-4999-8999-999999999999", name: "Shop B", slug: "shop-b", address: null, phone: null, whatsapp: null, theme_primary: null, theme_accent: null, theme_base: null };

test("a visitor on a shop host sees that shop's login with a create-account button", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.goto("/login");

  await expect(page.getByTestId("login-email")).toBeVisible();
  await expect(page.getByText("Create account")).toBeVisible();
});

test("an unknown shop shows 'Business not found'", async ({ page }) => {
  await page.route("**/rest/v1/shops**", (route) => json(route, []));
  await page.goto("/login");

  await expect(page.getByText("Business not found")).toBeVisible();
});

test("the bare domain offers staff login only", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => json(route, []));
  await page.goto(`http://localhost:${process.env.ZENC_E2E_WEB_PORT ?? "4173"}/login`);

  await expect(page.getByText("Open the link your business sent you", { exact: false })).toBeVisible();
  await expect(page.getByText("Create account")).toHaveCount(0);
});

test("a customer sees only the current shop's data and bootstraps there", async ({ page }) => {
  let bootstrapShop: unknown = null;
  await signInAsCustomer(page);
  await page.route("**/rest/v1/rpc/ensure_my_customer", (route) => {
    bootstrapShop = JSON.parse(route.request().postData() ?? "{}").p_shop_id;

    return json(route, customerRow());
  });
  await page.goto("/home");

  await expect.poll(() => bootstrapShop).toBe("11111111-1111-4111-8111-111111111111");
});

test("a customer opening the booking tab on shop A is sent to shop A's professionals", async ({ page }) => {
  await signInAsCustomer(page);
  await page.route("**/rest/v1/rpc/ensure_my_customer", (route) => json(route, customerRow()));
  await page.goto("/book");

  await expect(page).toHaveURL(/shopId=11111111-1111-4111-8111-111111111111/);
});

test("an owner of shop B opening shop A is sent to shop B's subdomain", async ({ page }) => {
  const ownerId = "55555555-5555-4555-8555-555555555555";

  // Same session seed the other specs use (Path A: replace this block with the cookie helper from tests/e2e/seed-session.ts).
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner B", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_my_shop")) return json(route, [{ shop_id: shopB.id, slug: "shop-b" }]);

    return json(route, []);
  });

  await page.goto("/agenda");

  await expect(page).toHaveURL(/^http:\/\/shop-b\.localhost:\d+\//);
});

test.describe("shop B", () => {
  test.use({ shop: shopB });

  test("the same build serves shop B on its own host", async ({ page, baseURL }) => {
    await page.route("**/rest/v1/**", (route) => json(route, []));
    await page.goto(`${baseURL!.replace("shop-a", "shop-b")}/login`);

    await expect(page.getByTestId("login-email")).toBeVisible();
  });
});
```

(The route calls inside the specs registered AFTER the fixture's wrapper still respect it: the fixture answers slug lookups first; see Step 3.)

- [ ] **Step 2: Run it and watch it fail**

Run (full procedure in Step 4): `PLAYWRIGHT_BROWSERS_PATH= npx playwright test -c playwright.chrome.config.ts tests/e2e/multi-shop.web.spec.ts`
Expected: FAIL (`./fixtures` missing).

- [ ] **Step 3: Implement the fixture and the host**

Create `tests/e2e/fixtures.ts`:

```ts
import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

type Shop = Record<string, unknown>;

export const defaultShop: Shop = {
  address: null, id: "11111111-1111-4111-8111-111111111111", name: "Shop", phone: null, slug: "shop-a",
  theme_accent: null, theme_base: null, theme_primary: null, whatsapp: null,
};

// Every shop-bound request starts with `GET /rest/v1/shops?...slug=eq.<slug>` (the current shop and its theme). Answering it here
// keeps the ~50 specs unchanged: their own `page.route` handlers still see every other request.
export const test = base.extend<{ shop: Shop }>({
  shop: [defaultShop, { option: true }],
  page: async ({ page, shop }, use) => {
    const original = page.route.bind(page);

    page.route = ((url: Parameters<typeof page.route>[0], handler: Parameters<typeof page.route>[1], options?: Parameters<typeof page.route>[2]) =>
      original(url, (route, request) => {
        const target = new URL(request.url());
        const isSlugLookup = request.method() === "GET" && target.pathname.endsWith("/rest/v1/shops") && (target.searchParams.get("slug") ?? "").startsWith("eq.");

        if (isSlugLookup) return route.fulfill({ body: JSON.stringify([shop]), contentType: "application/json" });

        return handler(route, request);
      }, options)) as typeof page.route;

    await use(page);
  },
});
```

In `src/lib/testing/e2e-web.ts`:

```ts
export function getE2EWebBaseUrl(port = getE2EWebPort()) {
  return `http://shop-a.localhost:${port}`;
}
```

(the static server still listens on `127.0.0.1`; Chrome resolves `*.localhost` to loopback). In `scripts/run-e2e-web.mjs` add to `env`: `EXPO_PUBLIC_SHOP_BASE_DOMAIN: "localhost"`; in `package.json` `e2e:export` prefix the command with `EXPO_PUBLIC_SHOP_BASE_DOMAIN=localhost`; in `playwright.chrome.config.ts` (local, uncommitted by convention) use `baseURL: "http://shop-a.localhost:4173"`. In `playwright.config.ts` nothing changes (it uses `getE2EWebBaseUrl`).

Mechanical import change for all specs:

```bash
grep -l 'from "@playwright/test"' tests/e2e/*.spec.ts | xargs sed -i 's#import { \(.*\) } from "@playwright/test";#import { \1 } from "./fixtures";#'
grep -L 'from "./fixtures"' tests/e2e/*.spec.ts            # must list nothing
```

Specs that import `Page`/`Route` types from `@playwright/test` keep a second type-only import (`import type { Page } from "@playwright/test";`): fix any the sed collapses wrongly (`npx tsc --noEmit` flags them).

**Path A only:** create `tests/e2e/seed-session.ts` exporting `seedSession(page, session)` that writes the `base64-` + base64url cookie `sb-example-auth-token` for `http://shop-a.localhost:<port>` via `page.context().addCookies`, then replace the two `localStorage.setItem("sb-…-auth-token", session)` lines in each of the 36 specs (`grep -l 'sb-example-auth-token' tests/e2e`) with a call to it. **Path B:** nothing, the adapter's legacy read keeps those lines working.

- [ ] **Step 4: Run the whole e2e suite**

```bash
mv .env.local /tmp/claude-1000/-home-samuel-projects-barberschedule/env.local.bak
trap 'mv /tmp/claude-1000/-home-samuel-projects-barberschedule/env.local.bak .env.local' EXIT
npm run e2e:export && (npm run e2e:serve &) && sleep 3
npx playwright test -c playwright.chrome.config.ts 2>&1 | tail -40
```

Expected: the whole suite passes. For each failure: if it is "business not found" the spec registers its own `/shops` handler that also answers slug lookups with a non-array or a shop without an id; fix it by returning an array that contains the fixture shop's `id`. If it is a session problem under Path B, the adapter's legacy read has a bug (the unit test in Task 12 covers it). Keep the two documented host-specific checks: `owner-shop.web.spec.ts` and `owner-appearance.web.spec.ts` should use `test.use({ shop: { ... } })` for the colours/contact they assert instead of their own `/shops` GET handler, because the fixture answers slug lookups first.

- [ ] **Step 5: Commit**

```bash
./node_modules/.bin/eslint app src tests scripts && npx tsc --noEmit
git add src/lib/testing/e2e-web.ts scripts/run-e2e-web.mjs package.json playwright.config.ts tests/e2e tests/unit/task1-review-fixes.test.ts
git commit -m "test(e2e): run on a shop host with a slug-lookup fixture, add the multi-shop spec"
```

---

### Task 15: Final verification and notes

**Files:**
- Modify: `docs/superpowers/specs/2026-11-18-shop-resolution-design.md` (status line), `README.md` or the project's dev-setup doc if it lists env vars (`grep -n "EXPO_PUBLIC" README.md docs/*.md`)

- [ ] **Step 1: Run every check**

```bash
npx tsc --noEmit
./node_modules/.bin/eslint app src tests scripts
npm run lint
npx jest 2>&1 | tail -8
npx supabase db reset && npx supabase test db 2>&1 | tail -8
npm run test:e2e:runner
```

Expected: 0 type errors; both lints clean; all Jest suites green (the suite count grows by the new files; the known "worker process has failed to exit gracefully" warning from `tests/integration/app-providers.test.ts` is pre-existing, see PR #98); pgTAP all files pass; the Node runner tests pass. Run the Playwright suite once more as in Task 14 step 5.

- [ ] **Step 2: Manual check on a real browser (3 minutes)**

With the local stack up and `.env.local` moved aside: export, serve, open `http://seed-shop.localhost:4173` (works), `http://nope-shop.localhost:4173` (business not found), `http://localhost:4173` (staff-login variant). Sign in as `owner@teste.com`: lands on the agenda. Document the result in the PR description. The shared login across real subdomains can only be checked on the hosted environment (spec: manual on hosting).

- [ ] **Step 3: Update the spec status and commit**

Change the spec's `Status:` line to `implemented on feat-shop-resolution`, and record in its Risks section the spike decision (`Path A` or `Path B`) with a link to `docs/superpowers/spikes/2026-11-18-cookie-session.md`.

```bash
git add docs
git commit -m "docs: shop resolution implemented, spike decision recorded"
```

---

## Execution deviations

What differed between this plan and the code as executed (2026-11-18, branch `feat-shop-resolution`).

- **Task 1 (spike):** Path B decided without building the Path A prototype. `@supabase/ssr` 0.12.7 hard-codes `flowType: "pkce"` after the caller's `auth` spread (source and a runtime check agree), which fails the go/no-go rule and the "implicit flow" requirement; it also ignores a custom `auth.storage`. Note: `docs/superpowers/spikes/2026-11-18-cookie-session.md`.
- **Task 3:** `011_customer_self_service.sql` passes `current_setting('t11.shop')::uuid` (the file's first shop by `created_at`, which is the seed shop), not the `T11 Shop` id the plan assumed; its two "anonymous / owner cannot ensure a customer" assertions also pass a shop id.
- **Task 4 (extended):** the plan assumed the bell count was a table query. It is `count_unread_notifications()`, and "mark all read" / "clear all" are `mark_notifications_read(uuid[])` / `delete_notifications(uuid[])`, which would have wiped other shops' inbox rows. Migration 0069 therefore also replaces those three functions with an optional `p_shop_id` (no argument = old behaviour), with four more assertions in `051` (plan(10)). `listNotifications(supabase, shopId, limit)`, `countUnread(supabase, shopId)`, `markRead(supabase, ids?, shopId?)`, `deleteNotifications(supabase, ids?, shopId?)`; the inbox screen only sends the shop for "all", not for specific ids.
- **Task 7:** `tests/unit/shop-gate.test.ts` mocks `useSafeAreaInsets` (Expo Router provides the provider above layouts; the unit test has none).
- **Task 8:** `tests/unit/root-layout.test.ts` mocks `CurrentShopProvider` and `ShopGate`. `shop-theme.test.ts`'s fake query builder lets `.eq()` continue into `.limit()`.
- **Task 10:** `use-appointment-cards.test.ts` now waits for the professional name (the shop name is synchronous, so it no longer works as the "queries finished" signal; the old version was timing-dependent).
- **Task 11:** `book/review.tsx` already had a `shopId` from the route params and keeps using it; `cookie-storage.test.ts` uses a 7000-character value (the plan's value produced 2 chunks, not 3).
- **Task 12:** Path B as planned.
- **Task 13:** `Linking.createURL("/")` on web is the origin without a trailing slash; the e2e asserts that.
- **Task 14:** the fixture also answers `POST /rest/v1/rpc/get_my_shop` (staff screens call it through `useOwnerShopId`) and registers a base route so specs that mock no REST at all still get a shop; options `shop` (null = unknown slug), `myShop` (staff shop, defaults to `shop`) and `interceptShops` (off for `owner-appearance`, which changes the shop row while it runs). `owner-shop.web.spec.ts` gets its shop through `test.use({ shop })`. `useMyShop` has `retry: false` so a failed lookup lets the app through instead of holding a spinner. `scripts/run-e2e-web.mjs` probes `http://127.0.0.1:<port>` (`getE2EWebProbeUrl`) and passes `EXPO_PUBLIC_SHOP_BASE_DOMAIN=localhost`. `playwright.chrome.config.ts` is git-ignored, edited locally only. The unknown-slug and owner-redirect specs use `test.use({ shop: null })` / `test.use({ myShop })` instead of per-test route mocks.
- **Hosted dev address (added by the orchestrator after the plan, user-approved):** the hosted DEV environment runs on a `*.workers.dev` address with no per-shop subdomains. When the web host is **not under** `EXPO_PUBLIC_SHOP_BASE_DOMAIN`, the current shop is resolved as `?shop=<slug>` (validated with the same slug rules, reserved names rejected) → the slug remembered in `sessionStorage` (`zenc.shop`) for the tab → `EXPO_PUBLIC_DEV_SHOP_SLUG` (same variable native uses) → none (bare-domain page). On hosts **under** the base domain (production `*.zencpro.app`, the bare domain, `*.localhost`) the query, the remembered slug and the dev slug are all ignored, so a crafted production link can never pick a shop, and nothing is written to `sessionStorage`. `shopUrl(slug, baseDomain, { hostname, port, protocol })` now takes the hostname and, off the base domain, builds `<origin>/?shop=<slug>` (so the staff redirect works on dev). Pure functions `validShopSlug`, `isUnderBaseDomain`, `resolveCurrentSlug` in `resolve-slug.ts` (tests in `resolve-shop-slug.test.ts`); `host.ts` does the `sessionStorage` side effects (tests in `current-shop-slug.test.ts`, both sides plus invalid/reserved slug and native).
