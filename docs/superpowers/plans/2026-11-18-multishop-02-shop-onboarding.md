# Shop onboarding: create a business, invite its owner, structured address (multi-shop, part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user (or a script) can create a business and invite its owner in one command, invited users set their own password on their shop's subdomain, and a shop's address is structured (CEP autofill) instead of one free-text line.

**Architecture:** A `service_role`-only `create_shop` SQL function does the transactional part (role to owner, shop row, slug rules from part 1). `scripts/create-shop.mjs` wraps the Admin invite endpoint plus `create_shop`, undoing the invite when the SQL step fails. A small shared pure helper builds each shop's link from a template (`https://{slug}.zencpro.app`) for the script and for `invite-professional`. The reset-password screen learns to accept invite sessions. The address becomes 8 columns, rendered by one `formatShopAddress` helper and filled on the owner's Shop screen by a ViaCEP lookup with BrasilAPI as fallback.

**Tech Stack:** Supabase (Postgres + pgTAP, Edge Function on Deno, Auth admin API), Node 24 script (`node --test`), Expo Router / React Native web, Jest (jest-expo, RNTL 14 async `render`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-18-shop-onboarding-design.md`

**Branch:** `feat-shop-onboarding`, cut from `feat-shop-resolution` after part 1 is complete (`git checkout -b feat-shop-onboarding feat-shop-resolution`). Part 3 stacks on it as `feat-installable-web`.

**Prerequisites from part 1 (this plan assumes they exist):** `shops.slug` (migration 0067) with `SLUG_PATTERN`/`RESERVED_SLUGS` in `src/features/shops/resolve-slug.ts`; `PublicShop` with `slug`, `PUBLIC_SHOP_COLUMNS`, `getShopBySlug` in `src/features/shops/api.ts`; `useCurrentShop()` in `src/features/shops/CurrentShopProvider.tsx`; the Playwright `test` fixture in `tests/e2e/fixtures.ts` (default shop object); `tests/unit/task1-review-fixes.test.ts`-style conventions. Migrations 0067 to 0069 and pgTAP 049 to 051 are taken, so this plan uses **0070**, **0071** and **052**, **053**. Error codes **P0041** and **P0042** are the next free ones (payouts used P0039/P0040).

## Open questions for the orchestrator

None of these changes the approved design; each says what this plan does meanwhile.

1. **`invite-professional` cannot read the shop's slug today.** `service_role` has no table privilege on `shops` (the repo's migrations 0047/0065 show new tables only give it TRUNCATE/REFERENCES/TRIGGER, and 0065 grants it per column where needed). **Plan does:** migration 0070 also grants `select (id, slug) on public.shops to service_role`, covered by pgTAP.
2. **The invite link is not recognised as a recovery/invite session today.** `/reset-password` only accepts a session that has the recovery proof: on web it is set by the `PASSWORD_RECOVERY` auth event, and `parseRecoveryUrl` only accepts `type=recovery` on native. An invite link carries `type=invite` and fires a plain `SIGNED_IN`. **Plan does:** a module-level "invite" proof, captured from the URL before the Supabase client consumes the hash (web) and from `type=invite` deep links (native), and a "Create your password" title. This is the "learns to accept an invite session" item of spec section 3, with its mechanism spelled out.
3. **The spec's redirect `https://<slug>.<base domain>/reset-password` is parametrised** by one template env var `SHOP_URL_TEMPLATE` (default `https://{slug}.zencpro.app`; local `http://{slug}.localhost:8081`), read by the script and by the Edge Function secret of the same name. Same result in production; local development and staging work too.
4. **BrasilAPI v2 does not return the IBGE city code** (ViaCEP does, as `ibge`). `address_city_ibge` is therefore filled only when ViaCEP answers; after a BrasilAPI fallback it is left null. The spec says "street, district, city, state and IBGE code fill in"; the fallback case is the exception.
5. **Dropping `shops.address` touches existing code and tests:** `supabase/tests/016_shop_info.sql` (writes and reads `address`), `tests/e2e/owner-shop.web.spec.ts` (the `shop-address` field), `tests/unit/shop-info-card.test.ts`, the calendar `location` in `app/(customer)/(tabs)/appointments.tsx:83`, and `ShopInfoCard`. The plan updates each (Tasks 6 to 9).
6. **After an invited owner sets their password the existing screen signs them out and sends them to `/login`** (`completePasswordReset` calls `signOut({ scope: "global" })`). Kept as is for both flows; an invited owner therefore signs in once more with the new password. The login shows a "Password created" notice for that case.
7. **Local mail is capturable.** The spec says local has no SMTP; the local stack ships Mailpit at `http://127.0.0.1:54324`, which shows the invite link, so the manual run of the script and of both invite functions can be done locally (a real SMTP sender is still needed on the hosted environment).

## Global Constraints

- `create_shop(p_name text, p_slug text, p_owner_user_id uuid, p_timezone text default 'America/Sao_Paulo')`, `security definer`, executable by `service_role` only. In one transaction it checks the profile exists and has no shop and is not a professional, sets `profiles.role = 'owner'`, inserts the shop. Slug taken or invalid raises `P0041 SHOP_SLUG_INVALID`; the user already owns a shop or is a professional (or has no profile) raises `P0042 SHOP_OWNER_INVALID`. Both get i18n messages (pt/es/en).
- Script `node scripts/create-shop.mjs --name "Barbearia do João" --slug barbeariadojoao --owner joao@email.com`: reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment (never from the repo); calls the Admin invite endpoint with `redirect_to = <shop link>/reset-password`, then `create_shop`; if `create_shop` fails it deletes the invited user; if the email already has an account it stops with a clear message (no promotion of existing accounts); prints the shop link and a reminder to generate the QR code.
- Invited users land on `/reset-password` with the title "Create your password" instead of "Reset password"; `invite-professional` passes the same kind of `redirect_to` (the professional's shop subdomain).
- Structured address replaces `shops.address`: `address_cep` (8 digits), `address_street`, `address_number`, `address_complement`, `address_district`, `address_city`, `address_state` (2-letter UF), `address_city_ibge` (7 digits). All nullable, length-checked, publicly readable and owner-updatable like today's `address`. The existing dev value moves into `address_street`. One helper `formatShopAddress(shop)` builds "Rua X, 123 - Sala 2 · Centro, São Paulo - SP".
- CEP field uses the input mask `00000-000`; at 8 digits the app calls `https://viacep.com.br/ws/<cep>/json/`; on network error or 5xx it tries `https://brasilapi.com.br/api/cep/v2/<cep>`. Found: street, district, city, state (and IBGE from ViaCEP) fill in, the cursor moves to the number field, every field stays editable (a city-wide CEP returns no street: the owner types it). Not found (`{"erro": true}` or 404): message "CEP not found, fill in the address", nothing is cleared. Only the CEP leaves the device.
- Project conventions: every `<Input>` needs a `placeholder` (an `examples.*` key); text in pt/es/en with parity (`tests/unit/locale-parity.test.ts`); new routes need `src/lib/navigation/parents.ts` (this part adds none); owner screens are declared in `app/(owner)/_layout.tsx` (`shop` already is in `MANAGE_SCREENS`); pop-ups are centred floating windows.
- Checks after every task: `npx tsc --noEmit`, `./node_modules/.bin/eslint app src tests scripts`, the Jest/node tests named. pgTAP after any SQL change: `npx supabase db reset && npx supabase test db`. Playwright (system Chrome, `.env.local` moved aside, procedure in part 1 Task 14) when screens change.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0070_create_shop.sql` (new) | `create_shop`, `service_role` grants (execute, `select (id, slug)` on shops) |
| `supabase/migrations/0071_shop_structured_address.sql` (new) | 8 address columns, data move, drop `address`, grants |
| `supabase/tests/052_create_shop.sql`, `053_shop_address.sql` (new); `016_shop_info.sql` (modify) | pgTAP |
| `supabase/functions/_shared/shop-url.ts` (new) | pure `buildShopUrl(template, slug, path)` used by the script and the Edge Function |
| `scripts/create-shop.mjs` (new), `scripts/create-shop.test.mjs` (new) | the user's tool and its `node --test` tests |
| `supabase/functions/invite-professional/index.ts` (modify) | `redirect_to` of the professional's shop |
| `src/features/auth/recovery.ts`, `api.ts`, `src/providers/AppProviders.tsx`, `app/reset-password.tsx`, `app/(auth)/login.tsx` (modify) | invite sessions |
| `src/features/shops/address.ts` (new) | `ShopAddress`, `formatShopAddress`, address column helpers |
| `src/features/shops/cep.ts` (new) | `lookupCep` (ViaCEP then BrasilAPI), `mergeCepResult` |
| `src/lib/input-masks.ts`, `src/components/ui/MaskedInputs.tsx` (modify) | `formatCepInput`, `CepInput` |
| `app/(owner)/shop.tsx`, `src/features/shops/api.ts`, `src/components/domain/ShopInfoCard.tsx` (modify) | the structured form and display |

---

### Task 1: Migration 0070 — `create_shop`

**Files:**
- Create: `supabase/migrations/0070_create_shop.sql`
- Create: `supabase/tests/052_create_shop.sql`

**Interfaces:**
- Produces: `public.create_shop(p_name text, p_slug text, p_owner_user_id uuid, p_timezone text default 'America/Sao_Paulo') returns public.shops` (service_role only); `service_role` may `select (id, slug)` on `public.shops`.

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/052_create_shop.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't52-new1@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't52-new2@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't52-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fc000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't52-pro@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fc000000-0000-0000-0000-000000000003';
update public.profiles set role = 'professional' where user_id = 'fc000000-0000-0000-0000-000000000004';
insert into public.shops (id, name, slug, owner_user_id)
values ('fc100000-0000-0000-0000-000000000001', 'T52 Existing', 'existing-t52', 'fc000000-0000-0000-0000-000000000003');

set local role service_role;

select results_eq(
  $$ select slug from public.create_shop('Barbearia Um', 'barbearia-um', 'fc000000-0000-0000-0000-000000000001') $$,
  $$ values ('barbearia-um'::text) $$,
  'create_shop returns the new shop'
);
select is((select role::text from public.profiles where user_id = 'fc000000-0000-0000-0000-000000000001'), 'owner', 'the user became the owner');
select is((select timezone from public.shops where slug = 'barbearia-um'), 'America/Sao_Paulo', 'the timezone defaults to Sao Paulo');

select throws_ok($$ select public.create_shop('Outra', 'barbearia-um', 'fc000000-0000-0000-0000-000000000002') $$, 'P0041', 'SHOP_SLUG_INVALID', 'a taken slug is rejected');
select throws_ok($$ select public.create_shop('Outra', 'www', 'fc000000-0000-0000-0000-000000000002') $$, 'P0041', 'SHOP_SLUG_INVALID', 'a reserved slug is rejected');
select throws_ok($$ select public.create_shop('Outra', 'AB', 'fc000000-0000-0000-0000-000000000002') $$, 'P0041', 'SHOP_SLUG_INVALID', 'a badly formatted slug is rejected');
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000003') $$, 'P0042', 'SHOP_OWNER_INVALID', 'an owner who already has a shop is rejected');
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000004') $$, 'P0042', 'SHOP_OWNER_INVALID', 'a professional is rejected');
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-00000000dead') $$, 'P0042', 'SHOP_OWNER_INVALID', 'an unknown user is rejected');
select is((select role::text from public.profiles where user_id = 'fc000000-0000-0000-0000-000000000002'), 'customer', 'a failed call leaves the user a customer');
select lives_ok($$ select id, slug from public.shops where slug = 'barbearia-um' $$, 'the service role can read shop id and slug (invite-professional needs it)');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fc000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000002') $$, '42501', null, 'a signed-in user cannot create shops');
reset role;

set local role anon;
select throws_ok($$ select public.create_shop('Outra', 'outra-loja', 'fc000000-0000-0000-0000-000000000002') $$, '42501', null, 'an anonymous visitor cannot create shops');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `052` fails (`function public.create_shop(...) does not exist`).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0070_create_shop.sql`:

```sql
-- Creates a business and makes an existing account its owner, in one transaction. Called by scripts/create-shop.mjs (service role)
-- right after it invites the owner; the future self-serve wizard reuses it. Slug rules live in the 0067 constraints.
create function public.create_shop(
  p_name text,
  p_slug text,
  p_owner_user_id uuid,
  p_timezone text default 'America/Sao_Paulo'
)
returns public.shops
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  owner_role public.profile_role;
  created public.shops;
  violated text;
begin
  select role into owner_role from public.profiles where user_id = p_owner_user_id;
  if not found
    or owner_role = 'professional'
    or exists (select 1 from public.professionals where user_id = p_owner_user_id)
    or exists (select 1 from public.shops where owner_user_id = p_owner_user_id)
  then
    raise exception using errcode = 'P0042', message = 'SHOP_OWNER_INVALID';
  end if;

  begin
    insert into public.shops (name, slug, owner_user_id, timezone)
    values (btrim(p_name), p_slug, p_owner_user_id, coalesce(p_timezone, 'America/Sao_Paulo'))
    returning * into created;
  exception when unique_violation or check_violation then
    get stacked diagnostics violated = constraint_name;
    if violated in ('shops_slug_key', 'shops_slug_format', 'shops_slug_not_reserved') then
      raise exception using errcode = 'P0041', message = 'SHOP_SLUG_INVALID';
    elsif violated = 'shops_owner_user_id_key' then
      raise exception using errcode = 'P0042', message = 'SHOP_OWNER_INVALID';
    end if;
    raise;
  end;

  update public.profiles set role = 'owner' where user_id = p_owner_user_id;

  return created;
end;
$$;

revoke all on function public.create_shop(text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_shop(text, text, uuid, text) to service_role;

-- invite-professional builds the professional's own shop link, so it reads the shop's slug with the service-role key.
grant select (id, slug) on table public.shops to service_role;
```

- [ ] **Step 4: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all files pass, `052_create_shop.sql` 13/13.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0070_create_shop.sql supabase/tests/052_create_shop.sql
git commit -m "feat(db): create_shop for service role with slug and owner rules"
```

---

### Task 2: Error codes P0041 and P0042 with i18n

**Files:**
- Modify: `src/lib/errors/domain-errors.ts` (union + `toDomainError`), `src/i18n/locales/en.ts`, `pt.ts`, `es.ts` (`errors.codes`)
- Test: `tests/unit/domain-errors-shops.test.ts`

**Interfaces:**
- Produces: `DomainErrorCode` gains `"SHOP_SLUG_INVALID"` and `"SHOP_OWNER_INVALID"`; `toDomainError({ code: "P0041" })` and `({ code: "P0042" })` map to them; `errorMessage(error, t, fallback)` returns the translated text for both.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain-errors-shops.test.ts`:

```ts
import i18n from "../../src/i18n";
import { errorMessage } from "../../src/i18n/errors";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("shop creation errors", () => {
  it.each([
    ["P0041", "SHOP_SLUG_INVALID"],
    ["P0042", "SHOP_OWNER_INVALID"],
  ])("%s maps to %s", (pgCode, domainCode) => {
    expect(toDomainError({ code: pgCode }).code).toBe(domainCode);
  });

  it.each([
    ["en", "SHOP_SLUG_INVALID", "That business link is taken or not allowed."],
    ["pt", "SHOP_OWNER_INVALID", "Esta conta não pode ser dona de um novo estabelecimento."],
    ["es", "SHOP_SLUG_INVALID", "Ese enlace del negocio está en uso o no es válido."],
  ])("%s translates %s", async (language, code, text) => {
    await i18n.changeLanguage(language);

    expect(errorMessage({ code }, i18n.t as never, "fallback")).toBe(text);
    await i18n.changeLanguage("en");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/domain-errors-shops.test.ts`
Expected: FAIL (`code` is `BOOKING_REQUEST_FAILED`).

- [ ] **Step 3: Implement**

`src/lib/errors/domain-errors.ts`: add `| "SHOP_SLUG_INVALID" | "SHOP_OWNER_INVALID"` to `DomainErrorCode` (after `"REPORT_FORBIDDEN"`), and two cases before `default` (after `P0029`):

```ts
    case "P0041":
      return new DomainError("SHOP_SLUG_INVALID", "That business link is taken or not allowed.");
    case "P0042":
      return new DomainError("SHOP_OWNER_INVALID", "This account cannot own a new business.");
```

Locale files (`errors.codes`, next to `REPORT_FORBIDDEN`):

```ts
// en.ts
      SHOP_SLUG_INVALID: "That business link is taken or not allowed.",
      SHOP_OWNER_INVALID: "This account cannot own a new business.",
// pt.ts
      SHOP_SLUG_INVALID: "Esse link do estabelecimento já está em uso ou não é permitido.",
      SHOP_OWNER_INVALID: "Esta conta não pode ser dona de um novo estabelecimento.",
// es.ts
      SHOP_SLUG_INVALID: "Ese enlace del negocio está en uso o no es válido.",
      SHOP_OWNER_INVALID: "Esta cuenta no puede ser dueña de un nuevo negocio.",
```

(`en.errors.codes` is typed from `DomainErrorCode`, so tsc forces all three files to carry both keys.)

- [ ] **Step 4: Run and see it pass**

Run: `npx jest tests/unit/domain-errors-shops.test.ts tests/unit/locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/lib/errors/domain-errors.ts src/i18n/locales tests/unit/domain-errors-shops.test.ts
git commit -m "feat(errors): shop slug and owner errors with pt/es/en messages"
```

---

### Task 3: `scripts/create-shop.mjs` and the shared shop-link helper

**Files:**
- Create: `supabase/functions/_shared/shop-url.ts`, `scripts/create-shop.mjs`, `scripts/create-shop.test.mjs`
- Test: `tests/unit/shop-url.test.ts` (Jest, the helper), `scripts/create-shop.test.mjs` (`node --test`, the script)
- Modify: `package.json` (`test:e2e:runner` also runs the new script test)

**Interfaces:**
- Produces:
  - `buildShopUrl(template: string, slug: string, path = "/"): string` — `template` contains `{slug}`; result has no double slash. Default template constant `DEFAULT_SHOP_URL_TEMPLATE = "https://{slug}.zencpro.app"`.
  - `run({ argv, env, fetch, log }): Promise<number>` exported from `scripts/create-shop.mjs` (exit code). Uses `parseArgs(argv)` → `{ name, owner, slug, timezone? }` or throws a message.
- Consumes: `SLUG_PATTERN`, `RESERVED_SLUGS` from `src/features/shops/resolve-slug.ts` (part 1; Node 24 strips the TS types, the same way `scripts/run-e2e-web.mjs` already imports `../src/lib/testing/e2e-web.ts`).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/shop-url.test.ts`:

```ts
import { buildShopUrl, DEFAULT_SHOP_URL_TEMPLATE } from "../../supabase/functions/_shared/shop-url";

describe("buildShopUrl", () => {
  it("fills the slug and appends the path", () => {
    expect(buildShopUrl("https://{slug}.zencpro.app", "barbeariadojoao", "/reset-password")).toBe("https://barbeariadojoao.zencpro.app/reset-password");
  });

  it("keeps a port and tolerates a trailing slash in the template", () => {
    expect(buildShopUrl("http://{slug}.localhost:8081/", "shop-a", "/reset-password")).toBe("http://shop-a.localhost:8081/reset-password");
  });

  it("defaults the path to the root", () => {
    expect(buildShopUrl(DEFAULT_SHOP_URL_TEMPLATE, "alfa")).toBe("https://alfa.zencpro.app/");
  });

  it("rejects a template without the slug placeholder", () => {
    expect(() => buildShopUrl("https://zencpro.app", "alfa")).toThrow("{slug}");
  });
});
```

Create `scripts/create-shop.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs, run } from "./create-shop.mjs";

const env = { SHOP_URL_TEMPLATE: "https://{slug}.zencpro.app", SUPABASE_SERVICE_ROLE_KEY: "service-key", SUPABASE_URL: "https://x.supabase.co" };
const argv = ["--name", "Barbearia do João", "--slug", "barbeariadojoao", "--owner", "joao@email.com"];

function fakeFetch(handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ body: init.body ? JSON.parse(init.body) : null, method: init.method ?? "GET", url: String(url) });
    for (const [match, respond] of handlers) if (String(url).includes(match) && (!respond.method || respond.method === (init.method ?? "GET"))) return respond.reply();
    throw new Error(`unexpected request ${url}`);
  };

  return { calls, fn };
}
const reply = (status, body) => ({ reply: () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) });
const logger = () => { const lines = []; return { lines, log: (line) => lines.push(line) }; };

test("parseArgs reads the three flags and the optional timezone", () => {
  assert.deepEqual(parseArgs([...argv, "--timezone", "America/Manaus"]), { name: "Barbearia do João", owner: "joao@email.com", slug: "barbeariadojoao", timezone: "America/Manaus" });
});

test("parseArgs refuses a missing flag and a bad slug before any request", () => {
  assert.throws(() => parseArgs(["--name", "X"]), /--slug/);
  assert.throws(() => parseArgs(["--name", "X", "--slug", "WWW", "--owner", "a@b.co"]), /slug/i);
  assert.throws(() => parseArgs(["--name", "X", "--slug", "www", "--owner", "a@b.co"]), /reserved/i);
});

test("invites the owner with the shop link, creates the shop and prints the link", async () => {
  const { calls, fn } = fakeFetch([
    ["/auth/v1/invite", reply(200, { id: "user-1" })],
    ["/rest/v1/rpc/create_shop", reply(200, { slug: "barbeariadojoao" })],
  ]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 0);
  assert.match(calls[0].url, /\/auth\/v1\/invite\?redirect_to=https%3A%2F%2Fbarbeariadojoao\.zencpro\.app%2Freset-password$/);
  assert.deepEqual(calls[0].body, { email: "joao@email.com" });
  assert.deepEqual(calls[1].body, { p_name: "Barbearia do João", p_owner_user_id: "user-1", p_slug: "barbeariadojoao", p_timezone: "America/Sao_Paulo" });
  assert.ok(out.lines.some((line) => line.includes("https://barbeariadojoao.zencpro.app")));
  assert.ok(out.lines.some((line) => /QR/i.test(line)));
});

test("an existing account stops before create_shop", async () => {
  const { calls, fn } = fakeFetch([["/auth/v1/invite", reply(422, { error_code: "email_exists" })]]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 1);
  assert.equal(calls.length, 1);
  assert.ok(out.lines.some((line) => /already has an account/i.test(line)));
});

test("a failed create_shop deletes the invited user", async () => {
  const { calls, fn } = fakeFetch([
    ["/auth/v1/invite", reply(200, { id: "user-1" })],
    ["/rest/v1/rpc/create_shop", reply(400, { code: "P0041", message: "SHOP_SLUG_INVALID" })],
    ["/auth/v1/admin/users/user-1", reply(200, {})],
  ]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 1);
  assert.equal(calls[2].method, "DELETE");
  assert.ok(out.lines.some((line) => /slug/i.test(line)));
});

test("missing environment variables are reported", async () => {
  const out = logger();

  assert.equal(await run({ argv, env: {}, fetch: async () => { throw new Error("no request expected"); }, log: out.log }), 1);
  assert.ok(out.lines.some((line) => line.includes("SUPABASE_URL")));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/shop-url.test.ts && node --test scripts/create-shop.test.mjs`
Expected: both FAIL (modules not found).

- [ ] **Step 3: Implement the helper and the script**

Create `supabase/functions/_shared/shop-url.ts` (plain TypeScript, no Deno or Node globals, so Jest, Node and the Edge runtime all load it):

```ts
// The public link of a shop, from a template such as "https://{slug}.zencpro.app" (production) or
// "http://{slug}.localhost:8081" (development). Used for invite e-mail redirects.
export const DEFAULT_SHOP_URL_TEMPLATE = "https://{slug}.zencpro.app";

export function buildShopUrl(template: string, slug: string, path = "/"): string {
  if (!template.includes("{slug}")) throw new Error("SHOP_URL_TEMPLATE must contain {slug}");

  return `${template.replace("{slug}", slug).replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
```

Create `scripts/create-shop.mjs`:

```js
// Creates a business and invites its owner. Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-shop.mjs --name "Barbearia do João" --slug barbeariadojoao --owner joao@email.com
// Optional: --timezone America/Sao_Paulo, SHOP_URL_TEMPLATE="https://{slug}.zencpro.app".
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildShopUrl, DEFAULT_SHOP_URL_TEMPLATE } from "../supabase/functions/_shared/shop-url.ts";
import { RESERVED_SLUGS, SLUG_PATTERN } from "../src/features/shops/resolve-slug.ts";

export function parseArgs(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 2) values[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  for (const flag of ["name", "slug", "owner"]) if (!values[flag]?.trim()) throw new Error(`Missing --${flag}`);
  if (!SLUG_PATTERN.test(values.slug)) throw new Error("Invalid slug: use 3 to 32 lowercase letters, digits or hyphens, no hyphen at either end.");
  if (RESERVED_SLUGS.includes(values.slug)) throw new Error(`The slug "${values.slug}" is reserved.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.owner)) throw new Error("Invalid --owner e-mail.");

  return { name: values.name.trim(), owner: values.owner.trim(), slug: values.slug, timezone: values.timezone };
}

export async function run({ argv, env, fetch: send, log }) {
  let args;

  try {
    args = parseArgs(argv);
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!env[name]) throw new Error(`Missing environment variable ${name}`);
  } catch (error) {
    log(error.message);
    return 1;
  }

  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const template = env.SHOP_URL_TEMPLATE || DEFAULT_SHOP_URL_TEMPLATE;
  const redirectTo = buildShopUrl(template, args.slug, "/reset-password");

  const invited = await send(`${base}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, { body: JSON.stringify({ email: args.owner }), headers, method: "POST" });
  if (!invited.ok) {
    log(invited.status === 422 || invited.status === 409
      ? `${args.owner} already has an account. Promoting existing accounts is not supported: use another e-mail.`
      : `Could not invite ${args.owner} (HTTP ${invited.status}).`);
    return 1;
  }
  const { id: userId } = await invited.json();

  const created = await send(`${base}/rest/v1/rpc/create_shop`, {
    body: JSON.stringify({ p_name: args.name, p_owner_user_id: userId, p_slug: args.slug, p_timezone: args.timezone ?? "America/Sao_Paulo" }),
    headers,
    method: "POST",
  });
  if (!created.ok) {
    const failure = await created.json().catch(() => ({}));

    await send(`${base}/auth/v1/admin/users/${userId}`, { headers, method: "DELETE" });
    log(failure.code === "P0041" ? `The slug "${args.slug}" is taken or not allowed. The invite was undone.`
      : failure.code === "P0042" ? "That account cannot own a new business. The invite was undone."
      : `create_shop failed (HTTP ${created.status}). The invite was undone.`);
    return 1;
  }

  log(`Business created: ${buildShopUrl(template, args.slug)}`);
  log(`Invite sent to ${args.owner}. Generate the QR code from that link and send it to the business.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run({ argv: process.argv.slice(2), env: process.env, fetch, log: console.log });
}
```

In `package.json` change `test:e2e:runner` to `node --test scripts/run-e2e-web.test.mjs scripts/assert-hosted-auth.test.mjs scripts/create-shop.test.mjs`.

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest tests/unit/shop-url.test.ts && node --test scripts/create-shop.test.mjs`
Expected: PASS (4 + 6 tests).

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npm run test:e2e:runner
git add supabase/functions/_shared/shop-url.ts scripts/create-shop.mjs scripts/create-shop.test.mjs tests/unit/shop-url.test.ts package.json
git commit -m "feat(scripts): create-shop invites the owner and creates the business"
```

---

### Task 4: `invite-professional` sends the professional's shop link

**Files:**
- Modify: `supabase/functions/invite-professional/index.ts`
- Test: extend `tests/unit/shop-url.test.ts` is not needed; the logic under test is the URL building (done in Task 3). The Edge Function itself has no harness in this repo (decision 013: manual run), so this task is a small, reviewed change plus a manual check.

**Interfaces:**
- Consumes: `buildShopUrl`, `DEFAULT_SHOP_URL_TEMPLATE` from `../_shared/shop-url.ts`; the `shops` select grant for `service_role` (Task 1).

- [ ] **Step 1: Make the change**

At the top of `supabase/functions/invite-professional/index.ts` add `import { buildShopUrl, DEFAULT_SHOP_URL_TEMPLATE } from "../_shared/shop-url.ts";`. After the ownership check (`if (!ownerResponse.ok || ... ) return json(403, ...)`) and the `PROFESSIONAL_INVITE_CONFLICT` guard, look the slug up and put it on the invite request:

```ts
  const shopResponse = await fetch(`${url}/rest/v1/shops?id=eq.${professional.shop_id}&select=slug`, { headers: service });
  const [shop] = (await shopResponse.json().catch(() => [])) as Array<{ slug: string }>;
  if (!shop) return json(500, { code: "INVITE_FAILED" });
  const redirectTo = buildShopUrl(Deno.env.get("SHOP_URL_TEMPLATE") ?? DEFAULT_SHOP_URL_TEMPLATE, shop.slug, "/reset-password");

  const invited = await fetch(`${url}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
    body: JSON.stringify({ email }),
    headers: service,
    method: "POST",
  });
```

(this replaces the existing `fetch(\`${url}/auth/v1/invite\`, ...)` call; nothing else in the function changes).

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts`
Expected: clean (the function directory is outside the TS project; the import path is checked by Jest in Step 3).

- [ ] **Step 3: Verify the import resolves under Jest**

Run: `npx jest tests/unit/shop-url.test.ts`
Expected: PASS (same module the function imports).

- [ ] **Step 4: Manual check against the local stack (Mailpit)**

```bash
npx supabase functions serve invite-professional --env-file <(echo 'SHOP_URL_TEMPLATE=http://{slug}.localhost:8081')
```

As the dev owner, invite a professional with an e-mail through the app (or `curl` the function with the owner's JWT). Open `http://127.0.0.1:54324` and confirm the invite mail's link ends with `redirect_to=http%3A%2F%2Fseed-shop.localhost%3A8081%2Freset-password`. Note the result in the commit body. (Hosted: `supabase secrets set SHOP_URL_TEMPLATE=https://{slug}.zencpro.app`, hosting track.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/invite-professional/index.ts
git commit -m "feat(invite): professional invites land on the shop's own subdomain"
```

---

### Task 5: `/reset-password` accepts invite sessions ("Create your password")

**Files:**
- Modify: `src/features/auth/recovery.ts`, `src/features/auth/api.ts` (`startRecoverySession`, `completePasswordReset`), `src/providers/AppProviders.tsx`, `app/reset-password.tsx`, `app/(auth)/login.tsx`, `src/i18n/locales/en.ts`, `pt.ts`, `es.ts`
- Test: extend `tests/unit/recovery.test.ts`, `tests/unit/password-reset-api.test.ts`; Extend `tests/e2e/auth.web.spec.ts`

**Interfaces:**
- Produces in `recovery.ts`:
  - `RecoveryLink` tokens variant gains `flow: "recovery" | "invite"`: `{ kind: "tokens"; accessToken; refreshToken; flow }`; `parseRecoveryUrl` accepts `type=recovery` and `type=invite`.
  - `isInviteUrl(url: string | null | undefined): boolean` (true when the hash or query has `type=invite` and an `access_token`).
  - `markInvite()`, `isInvite()`; `hasRecovery()` is true for both flows; `clearRecovery()` clears both.
- `startRecoverySession(supabase, link)` marks the flow of `link.flow` (default `"recovery"` for existing callers).
- i18n: `auth.reset.createTitle`, `auth.reset.createSubtitle`, `auth.reset.createSubmit`, `auth.login.passwordCreated`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/recovery.test.ts` (and update its first import to also take `isInvite`, `isInviteUrl`, `markInvite`):

```ts
describe("invite links", () => {
  it("parses an invite deep link as a tokens link with the invite flow", () => {
    expect(parseRecoveryUrl("zenc://reset-password#access_token=a&refresh_token=r&type=invite")).toEqual({
      accessToken: "a", flow: "invite", kind: "tokens", refreshToken: "r",
    });
  });

  it("keeps the recovery flow for recovery links", () => {
    expect(parseRecoveryUrl("zenc://reset-password#access_token=a&refresh_token=r&type=recovery")).toMatchObject({ flow: "recovery" });
  });

  it("recognises an invite URL from the hash", () => {
    expect(isInviteUrl("https://alfa.zencpro.app/reset-password#access_token=a&refresh_token=r&type=invite")).toBe(true);
    expect(isInviteUrl("https://alfa.zencpro.app/reset-password#access_token=a&refresh_token=r&type=recovery")).toBe(false);
    expect(isInviteUrl(null)).toBe(false);
  });

  it("an invite proof counts as recovery proof and is cleared with it", () => {
    clearRecovery();
    markInvite();
    expect(hasRecovery()).toBe(true);
    expect(isInvite()).toBe(true);
    clearRecovery();
    expect(hasRecovery()).toBe(false);
    expect(isInvite()).toBe(false);
  });
});
```

The two existing `toEqual({ accessToken: "a", kind: "tokens", refreshToken: "r" })` expectations in this file gain `flow: "recovery"`.

Add to `tests/unit/password-reset-api.test.ts` a case that `startRecoverySession(supabase, { accessToken: "a", refreshToken: "r2", flow: "invite" })` leaves `isInvite()` true (import `isInvite`, `clearRecovery` from the recovery module; reset with `clearRecovery()` first).

Extend `tests/e2e/auth.web.spec.ts`: after the recovery test add the invite equivalent (the file already has `recoveryHash()`; parametrise it as `recoveryHash(type = "recovery")` and keep existing callers working):

```ts
test("an invite link opens 'Create your password', saves it and returns to login", async ({ page }) => {
  await mockCustomerRest(page);
  await page.route("**/auth/v1/user", (route) => json(route, recoveryUser));
  await page.route("**/auth/v1/logout**", (route) => route.fulfill({ status: 204 }));

  await page.goto(`/reset-password${recoveryHash("invite")}`);
  await expect(page.getByRole("heading", { name: "Create your password" })).toBeVisible();
  await page.getByTestId("reset-new").fill("brand-new-1");
  await page.getByTestId("reset-confirm").fill("brand-new-1");
  await page.getByTestId("reset-submit").click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Password created. Sign in with it.")).toBeVisible();
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/recovery.test.ts tests/unit/password-reset-api.test.ts`
Expected: FAIL (`flow` missing, `isInviteUrl` is not exported).

- [ ] **Step 3: Implement**

`src/features/auth/recovery.ts`:

```ts
export type RecoveryFlow = "recovery" | "invite";

export type RecoveryLink =
  | { kind: "tokens"; accessToken: string; refreshToken: string; flow: RecoveryFlow }
  | { kind: "error" }
  | { kind: "none" };

function linkParams(url: string) {
  const [beforeHash, fragment = ""] = url.split("#");
  const query = beforeHash.split("?")[1] ?? "";

  return new URLSearchParams([query, fragment].filter(Boolean).join("&"));
}

export function parseRecoveryUrl(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: "none" };

  const params = linkParams(url);

  if (params.get("error") || params.get("error_code") || params.get("error_description")) return { kind: "error" };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");

  if (accessToken && refreshToken && (type === "recovery" || type === "invite")) {
    return { accessToken, flow: type, kind: "tokens", refreshToken };
  }

  return { kind: "none" };
}

// An invite link signs the user in with a plain SIGNED_IN event (no PASSWORD_RECOVERY), and supabase-js removes the hash as soon as
// it consumes it, so the web app captures this before the client is created.
export function isInviteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const params = linkParams(url);

  return params.get("type") === "invite" && Boolean(params.get("access_token"));
}

let recoveryProof = false;
let inviteProof = false;

export const markRecovery = () => {
  recoveryProof = true;
};
export const markInvite = () => {
  recoveryProof = true;
  inviteProof = true;
};
export const hasRecovery = () => recoveryProof;
export const isInvite = () => inviteProof;
export const clearRecovery = () => {
  recoveryProof = false;
  inviteProof = false;
};
```

(keep the rest of the file, `RecoveryStatus` and `resolveRecoveryStatus`, unchanged; keep the existing comment above the proof variables.)

`src/features/auth/api.ts`: `startRecoverySession(supabase, link: { accessToken: string; refreshToken: string; flow?: RecoveryFlow })` ends with `if (link.flow === "invite") markInvite(); else markRecovery();` (import `markInvite`, `RecoveryFlow`).

`src/providers/AppProviders.tsx`: before creating the client, capture an invite link on web:

```ts
const supabase = useMemo(() => {
  // supabase-js consumes (and removes) the URL hash when the client is created, so note an invite link first.
  if (Platform.OS === "web" && typeof window !== "undefined" && isInviteUrl(window.location.href)) markInvite();

  return getSupabaseBrowserClient();
}, []);
```

(import `Platform` from `react-native` next to `AppState`, `isInviteUrl`/`markInvite` from `../features/auth/recovery`; the existing `markRecovery` import stays.)

`app/reset-password.tsx`: `import { isInvite } from ...recovery`; `const invite = isInvite();` and:

```tsx
<Text accessibilityRole="header" ...>{invite ? t("auth.reset.createTitle") : t("auth.reset.setTitle")}</Text>
<Text ...>{invite ? t("auth.reset.createSubtitle") : t("auth.reset.setSubtitle")}</Text>
...
label={invite ? t("auth.reset.createSubmit") : t("auth.reset.saveSubmit")}
```

`save()` must read the flow **before** `completePasswordReset` clears it: `const flow = isInvite() ? "password-created" : "password-reset";` then `router.replace({ params: { notice: flow }, pathname: "/login" })`. The native deep-link handler passes the whole link through (`startRecoverySession(supabase, link)` already receives `flow`).

`app/(auth)/login.tsx`: a second toast next to the existing one:

```tsx
<Toast message={t("auth.login.passwordCreated")} onDismiss={() => setNoticeDismissed(true)} variant="success" visible={notice === "password-created" && !noticeDismissed} />
```

Locale additions (`auth.reset` and `auth.login`):

```ts
// en
      createSubmit: "Create password",        // auth.reset
      createSubtitle: "Choose a password to finish setting up your account.",
      createTitle: "Create your password",
      passwordCreated: "Password created. Sign in with it.",   // auth.login
// pt
      createSubmit: "Criar senha",
      createSubtitle: "Escolha uma senha para concluir a criação da sua conta.",
      createTitle: "Crie sua senha",
      passwordCreated: "Senha criada. Entre com ela.",
// es
      createSubmit: "Crear contraseña",
      createSubtitle: "Elige una contraseña para terminar de crear tu cuenta.",
      createTitle: "Crea tu contraseña",
      passwordCreated: "Contraseña creada. Ingresa con ella.",
```

- [ ] **Step 4: Run and see them pass**

Run: `npx jest tests/unit/recovery.test.ts tests/unit/password-reset-api.test.ts tests/unit/locale-parity.test.ts tests/integration/auth.test.ts`
Then the e2e spec (procedure in part 1 Task 14): `npx playwright test -c playwright.chrome.config.ts tests/e2e/auth.web.spec.ts`
Expected: PASS, including the new invite test and the three existing recovery tests.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/auth src/providers/AppProviders.tsx app/reset-password.tsx "app/(auth)/login.tsx" src/i18n/locales tests/unit/recovery.test.ts tests/unit/password-reset-api.test.ts tests/e2e/auth.web.spec.ts
git commit -m "feat(auth): invited users create their password on their shop's subdomain"
```

---

### Task 6: Migration 0071 — structured address columns

**Files:**
- Create: `supabase/migrations/0071_shop_structured_address.sql`, `supabase/tests/053_shop_address.sql`
- Modify: `supabase/tests/016_shop_info.sql`

**Interfaces:**
- Produces: `shops.address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge` (all `text`, nullable); `shops.address` is gone; public select and owner update grants on the 8 columns.

- [ ] **Step 1: Write the failing pgTAP test and update 016**

Create `supabase/tests/053_shop_address.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't53-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fd000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't53-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fd000000-0000-0000-0000-000000000001';
insert into public.shops (id, name, owner_user_id)
values ('fd100000-0000-0000-0000-000000000001', 'T53 Shop', 'fd000000-0000-0000-0000-000000000001');

select hasnt_column('public', 'shops', 'address', 'the free-text address is gone');
select has_column('public', 'shops', 'address_city_ibge', 'the structured address exists');

select throws_ok($$ update public.shops set address_cep = '1234' where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'a CEP has 8 digits');
select throws_ok($$ update public.shops set address_state = 'sp' where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'a UF is 2 capital letters');
select throws_ok($$ update public.shops set address_city_ibge = '35503' where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'an IBGE code has 7 digits');
select throws_ok($$ update public.shops set address_street = repeat('x', 121) where id = 'fd100000-0000-0000-0000-000000000001' $$, '23514', null, 'street is length-limited');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ update public.shops set address_cep = '01310100', address_street = 'Avenida Paulista', address_number = '1000', address_complement = 'Sala 2',
       address_district = 'Bela Vista', address_city = 'São Paulo', address_state = 'SP', address_city_ibge = '3550308'
     where id = 'fd100000-0000-0000-0000-000000000001' $$,
  'the owner writes the whole address'
);
reset role;

set local role anon;
select results_eq(
  $$ select address_city, address_state from public.shops where id = 'fd100000-0000-0000-0000-000000000001' $$,
  $$ values ('São Paulo'::text, 'SP'::text) $$,
  'anonymous visitors read the address'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fd000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$ with changed as (update public.shops set address_city = 'Hack' where id = 'fd100000-0000-0000-0000-000000000001' returning 1) select count(*)::int from changed $$,
  $$ values (0) $$,
  'a customer changes no row'
);
reset role;
select is((select address_city from public.shops where id = 'fd100000-0000-0000-0000-000000000001'), 'São Paulo', 'and the address is untouched');

select * from finish();
rollback;
```

In `supabase/tests/016_shop_info.sql` lines 27 and 32 replace the `address` column with `address_street`:

```sql
select lives_ok($$ update public.shops set address_street = 'Rua A, 10', phone = '(11) 3000-0000', whatsapp = '(11) 99999-0000' where id = '94000000-0000-0000-0000-000000000001' $$, 'owner updates contact info');
...
select is((select address_street from public.shops where id = '94000000-0000-0000-0000-000000000001'), 'Rua A, 10', 'a customer can read the address');
```

(read the rest of 016 with `grep -n "address" supabase/tests/016_shop_info.sql` and update every other mention the same way.)

- [ ] **Step 2: Run it and watch it fail**

Run: `npx supabase db reset && npx supabase test db`
Expected: `053` and `016` fail (columns missing).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0071_shop_structured_address.sql`:

```sql
-- The address becomes structured so a future location-based directory does not have to ask businesses again. The old
-- free-text value is kept in address_street.
alter table public.shops
  add column address_cep text,
  add column address_street text,
  add column address_number text,
  add column address_complement text,
  add column address_district text,
  add column address_city text,
  add column address_state text,
  add column address_city_ibge text,
  add constraint shops_address_cep_fmt check (address_cep is null or address_cep ~ '^[0-9]{8}$'),
  add constraint shops_address_state_fmt check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  add constraint shops_address_ibge_fmt check (address_city_ibge is null or address_city_ibge ~ '^[0-9]{7}$'),
  add constraint shops_address_street_len check (address_street is null or char_length(address_street) <= 120),
  add constraint shops_address_number_len check (address_number is null or char_length(address_number) <= 20),
  add constraint shops_address_complement_len check (address_complement is null or char_length(address_complement) <= 60),
  add constraint shops_address_district_len check (address_district is null or char_length(address_district) <= 60),
  add constraint shops_address_city_len check (address_city is null or char_length(address_city) <= 60);

update public.shops set address_street = left(btrim(address), 120) where address is not null and btrim(address) <> '';

alter table public.shops drop column address;

grant select (address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge)
  on table public.shops to anon, authenticated;
grant update (address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge)
  on table public.shops to authenticated;
```

(dropping the column also drops its `shops_address_len` check and its grants.)

- [ ] **Step 4: Run pgTAP and see it pass**

Run: `npx supabase db reset && npx supabase test db`
Expected: all pass, `053` 10/10, `016` unchanged count.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0071_shop_structured_address.sql supabase/tests/053_shop_address.sql supabase/tests/016_shop_info.sql
git commit -m "feat(db): structured shop address replaces the free-text one"
```

---

### Task 7: Pure address helpers — `formatShopAddress` and the column mapping

**Files:**
- Create: `src/features/shops/address.ts`
- Test: `tests/unit/shop-address.test.ts`

**Interfaces:**
- Produces:
  - `type ShopAddressColumns = { address_cep: string | null; address_city: string | null; address_city_ibge: string | null; address_complement: string | null; address_district: string | null; address_number: string | null; address_state: string | null; address_street: string | null }`
  - `type ShopAddress = { cep: string; city: string; cityIbge: string; complement: string; district: string; number: string; state: string; street: string }` (form shape, `""` for missing) and `EMPTY_ADDRESS: ShopAddress`
  - `formatShopAddress(shop: Partial<ShopAddressColumns>): string` — `"Rua X, 123 - Sala 2 · Centro, São Paulo - SP"`; `""` when nothing is set
  - `addressFromColumns(shop: Partial<ShopAddressColumns>): ShopAddress`, `addressToColumns(address: ShopAddress): ShopAddressColumns` (blank → `null`, CEP stripped to digits, UF upper-cased)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/shop-address.test.ts`:

```ts
import { addressFromColumns, addressToColumns, formatShopAddress } from "../../src/features/shops/address";

const full = {
  address_cep: "01310100", address_city: "São Paulo", address_city_ibge: "3550308", address_complement: "Sala 2",
  address_district: "Centro", address_number: "123", address_state: "SP", address_street: "Rua X",
};

describe("formatShopAddress", () => {
  it("builds the single line", () => {
    expect(formatShopAddress(full)).toBe("Rua X, 123 - Sala 2 · Centro, São Paulo - SP");
  });

  it.each([
    ["no complement", { ...full, address_complement: null }, "Rua X, 123 · Centro, São Paulo - SP"],
    ["no number", { ...full, address_number: null, address_complement: null }, "Rua X · Centro, São Paulo - SP"],
    ["no district", { ...full, address_district: null }, "Rua X, 123 - Sala 2 · São Paulo - SP"],
    ["no street (a city-wide CEP)", { ...full, address_street: null, address_number: null, address_complement: null }, "Centro, São Paulo - SP"],
    ["only city and state", { address_city: "Recife", address_state: "PE" }, "Recife - PE"],
    ["blanks are ignored", { ...full, address_street: "  ", address_complement: "" }, "123 · Centro, São Paulo - SP"],
    ["nothing at all", {}, ""],
  ])("%s", (_name, shop, expected) => {
    expect(formatShopAddress(shop)).toBe(expected);
  });
});

describe("address column mapping", () => {
  it("turns blank form fields into nulls, keeps digits of the CEP and upper-cases the UF", () => {
    expect(addressToColumns({ cep: "01310-100", city: " São Paulo ", cityIbge: "", complement: "", district: "Centro", number: "123", state: "sp", street: "Rua X" })).toEqual({
      address_cep: "01310100", address_city: "São Paulo", address_city_ibge: null, address_complement: null,
      address_district: "Centro", address_number: "123", address_state: "SP", address_street: "Rua X",
    });
  });

  it("formats the stored CEP back as 00000-000 for the form", () => {
    expect(addressFromColumns(full)).toEqual({ cep: "01310-100", city: "São Paulo", cityIbge: "3550308", complement: "Sala 2", district: "Centro", number: "123", state: "SP", street: "Rua X" });
    expect(addressFromColumns({}).cep).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/shop-address.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/features/shops/address.ts`:

```ts
export type ShopAddressColumns = {
  address_cep: string | null;
  address_city: string | null;
  address_city_ibge: string | null;
  address_complement: string | null;
  address_district: string | null;
  address_number: string | null;
  address_state: string | null;
  address_street: string | null;
};

// The form's shape: strings, "" when a part is missing.
export type ShopAddress = { cep: string; city: string; cityIbge: string; complement: string; district: string; number: string; state: string; street: string };

export const EMPTY_ADDRESS: ShopAddress = { cep: "", city: "", cityIbge: "", complement: "", district: "", number: "", state: "", street: "" };

const text = (value: string | null | undefined) => value?.trim() ?? "";
const join = (parts: string[], separator: string) => parts.filter(Boolean).join(separator);
const maskCep = (digits: string) => (digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5, 8)}` : digits);

// "Rua X, 123 - Sala 2 · Centro, São Paulo - SP", skipping whatever is missing.
export function formatShopAddress(shop: Partial<ShopAddressColumns>): string {
  const street = join([join([text(shop.address_street), text(shop.address_number)], ", "), text(shop.address_complement)], " - ");
  const locality = join([text(shop.address_district), join([text(shop.address_city), text(shop.address_state)], " - ")], ", ");

  return join([street, locality], " · ");
}

export function addressFromColumns(shop: Partial<ShopAddressColumns>): ShopAddress {
  return {
    cep: maskCep(text(shop.address_cep)),
    city: text(shop.address_city),
    cityIbge: text(shop.address_city_ibge),
    complement: text(shop.address_complement),
    district: text(shop.address_district),
    number: text(shop.address_number),
    state: text(shop.address_state),
    street: text(shop.address_street),
  };
}

export function addressToColumns(address: ShopAddress): ShopAddressColumns {
  const clean = (value: string) => value.trim() || null;

  return {
    address_cep: address.cep.replace(/\D/g, "") || null,
    address_city: clean(address.city),
    address_city_ibge: address.cityIbge.replace(/\D/g, "") || null,
    address_complement: clean(address.complement),
    address_district: clean(address.district),
    address_number: clean(address.number),
    address_state: clean(address.state)?.toUpperCase() ?? null,
    address_street: clean(address.street),
  };
}
```

- [ ] **Step 4: Run and see it pass**

Run: `npx jest tests/unit/shop-address.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Nothing else uses this module yet, so the tree stays green.

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/shops/address.ts tests/unit/shop-address.test.ts
git commit -m "feat(shops): structured address helpers"
```

---

### Task 8: CEP mask and lookup (ViaCEP, BrasilAPI fallback)

**Files:**
- Create: `src/features/shops/cep.ts`
- Modify: `src/lib/input-masks.ts` (`formatCepInput`), `src/components/ui/MaskedInputs.tsx` (`CepInput`), `src/i18n/locales/{en,pt,es}.ts` (`examples`, `owner.shop`)
- Test: `tests/unit/cep.test.ts`, extend `tests/unit/input-masks.test.ts` (find the existing file with `ls tests/unit | grep mask`; create `tests/unit/cep-mask.test.ts` if none)

**Interfaces:**
- Produces:
  - `formatCepInput(input: string): string` → `"01310-100"` (digits only, max 8)
  - `type CepResult = { status: "found"; address: { city: string; cityIbge: string; district: string; state: string; street: string } } | { status: "not-found" } | { status: "unavailable" }`
  - `lookupCep(cep: string, fetchFn?: typeof fetch): Promise<CepResult>` — `cep` is 8 digits.
  - `mergeCepResult(current: ShopAddress, found: Extract<CepResult, { status: "found" }>["address"]): ShopAddress` — found non-empty values replace street/district/city/state/IBGE; empty ones (a city-wide CEP has no street) keep what the owner typed; number and complement are never touched.
  - `<CepInput>` (masked `Input`, `keyboardType="number-pad"`, default placeholder `t("examples.cep")`).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/cep.test.ts`:

```ts
import { lookupCep, mergeCepResult } from "../../src/features/shops/cep";
import { EMPTY_ADDRESS } from "../../src/features/shops/address";
import { formatCepInput } from "../../src/lib/input-masks";

const viaCep = { bairro: "Bela Vista", cep: "01310-100", complemento: "", ibge: "3550308", localidade: "São Paulo", logradouro: "Avenida Paulista", uf: "SP" };
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });

describe("formatCepInput", () => {
  it.each([["0131", "0131"], ["01310100", "01310-100"], ["01310-100", "01310-100"], ["0131010099", "01310-100"], ["ab12", "12"], ["", ""]])("%j -> %j", (input, expected) => {
    expect(formatCepInput(input)).toBe(expected);
  });
});

describe("lookupCep", () => {
  it("returns the ViaCEP address", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, viaCep));

    await expect(lookupCep("01310100", fetchFn)).resolves.toEqual({
      address: { city: "São Paulo", cityIbge: "3550308", district: "Bela Vista", state: "SP", street: "Avenida Paulista" },
      status: "found",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith("https://viacep.com.br/ws/01310100/json/");
  });

  it("reports not-found without trying the fallback when ViaCEP says erro", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, { erro: true }));

    await expect(lookupCep("99999999", fetchFn)).resolves.toEqual({ status: "not-found" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to BrasilAPI on a network error (no IBGE code there)", async () => {
    const fetchFn = jest.fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(respond(200, { city: "São Paulo", cep: "01310100", neighborhood: "Bela Vista", state: "SP", street: "Avenida Paulista" }));

    await expect(lookupCep("01310100", fetchFn)).resolves.toEqual({
      address: { city: "São Paulo", cityIbge: "", district: "Bela Vista", state: "SP", street: "Avenida Paulista" },
      status: "found",
    });
    expect(fetchFn).toHaveBeenLastCalledWith("https://brasilapi.com.br/api/cep/v2/01310100");
  });

  it("falls back on a 5xx and treats a BrasilAPI 404 as not-found", async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(respond(503, {})).mockResolvedValueOnce(respond(404, { message: "CEP não encontrado" }));

    await expect(lookupCep("99999999", fetchFn)).resolves.toEqual({ status: "not-found" });
  });

  it("is unavailable when both services are down", async () => {
    const fetchFn = jest.fn().mockRejectedValue(new TypeError("network"));

    await expect(lookupCep("01310100", fetchFn)).resolves.toEqual({ status: "unavailable" });
  });
});

describe("mergeCepResult", () => {
  const found = { city: "São Paulo", cityIbge: "3550308", district: "Bela Vista", state: "SP", street: "Avenida Paulista" };

  it("fills the lookup fields and never touches number or complement", () => {
    expect(mergeCepResult({ ...EMPTY_ADDRESS, cep: "01310-100", complement: "Sala 2", number: "1000" }, found)).toEqual({
      cep: "01310-100", city: "São Paulo", cityIbge: "3550308", complement: "Sala 2", district: "Bela Vista", number: "1000", state: "SP", street: "Avenida Paulista",
    });
  });

  it("keeps what the owner typed where the CEP has no value (a city-wide CEP has no street)", () => {
    const merged = mergeCepResult({ ...EMPTY_ADDRESS, street: "Rua que digitei" }, { ...found, district: "", street: "" });

    expect(merged.street).toBe("Rua que digitei");
    expect(merged.city).toBe("São Paulo");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/cep.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/input-masks.ts` (append):

```ts
// 8 digits shown as 00000-000.
export function formatCepInput(input: string) {
  const d = digits(input).slice(0, 8);

  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
```

`src/components/ui/MaskedInputs.tsx` (append; import `formatCepInput`):

```tsx
export function CepInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} keyboardType="number-pad" onChangeText={(text) => onChangeValue(formatCepInput(text))} placeholder={placeholder ?? t("examples.cep")} value={value} />;
}
```

Create `src/features/shops/cep.ts`:

```ts
import type { ShopAddress } from "./address";

type Found = { city: string; cityIbge: string; district: string; state: string; street: string };
export type CepResult = { address: Found; status: "found" } | { status: "not-found" } | { status: "unavailable" };

// Free, keyless and CORS-enabled. Only the CEP (the business's public address) leaves the device.
const VIACEP = (cep: string) => `https://viacep.com.br/ws/${cep}/json/`;
const BRASILAPI = (cep: string) => `https://brasilapi.com.br/api/cep/v2/${cep}`;

export async function lookupCep(cep: string, fetchFn: typeof fetch = fetch): Promise<CepResult> {
  try {
    const response = await fetchFn(VIACEP(cep));

    if (response.ok) {
      const body = (await response.json()) as { bairro?: string; erro?: boolean | string; ibge?: string; localidade?: string; logradouro?: string; uf?: string };

      if (body.erro) return { status: "not-found" };

      return { address: { city: body.localidade ?? "", cityIbge: body.ibge ?? "", district: body.bairro ?? "", state: body.uf ?? "", street: body.logradouro ?? "" }, status: "found" };
    }
    if (response.status < 500) return { status: "not-found" };
  } catch {
    // network error: try the fallback below
  }

  try {
    const response = await fetchFn(BRASILAPI(cep));

    if (response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as { city?: string; neighborhood?: string; state?: string; street?: string };

    // BrasilAPI v2 has no IBGE code: the field stays empty after a fallback.
    return { address: { city: body.city ?? "", cityIbge: "", district: body.neighborhood ?? "", state: body.state ?? "", street: body.street ?? "" }, status: "found" };
  } catch {
    return { status: "unavailable" };
  }
}

export function mergeCepResult(current: ShopAddress, found: Found): ShopAddress {
  const pick = (next: string, previous: string) => next || previous;

  return {
    ...current,
    city: pick(found.city, current.city),
    cityIbge: pick(found.cityIbge, current.cityIbge),
    district: pick(found.district, current.district),
    state: pick(found.state, current.state),
    street: pick(found.street, current.street),
  };
}
```

Locale additions: `examples` gets `cep`, `city`, `complement`, `district`, `number`, `state`, `street` (keep `address` until Task 9 removes its last use in `shop.tsx`); `owner.shop` gets labels and the not-found message:

```ts
// en examples
    cep: "01310-100", city: "São Paulo", complement: "Suite 2", district: "Downtown", number: "123", state: "SP", street: "Flower Street",
// en owner.shop (replace `address: "Address"`)
      cep: "Postal code (CEP)", cepNotFound: "CEP not found, fill in the address.", cepUnavailable: "Could not look up the CEP, fill in the address.",
      city: "City", complement: "Complement", district: "District", number: "Number", state: "State (UF)", street: "Street",
// pt examples
    cep: "01310-100", city: "São Paulo", complement: "Sala 2", district: "Centro", number: "123", state: "SP", street: "Rua das Flores",
// pt owner.shop
      cep: "CEP", cepNotFound: "CEP não encontrado, preencha o endereço.", cepUnavailable: "Não foi possível consultar o CEP, preencha o endereço.",
      city: "Cidade", complement: "Complemento", district: "Bairro", number: "Número", state: "Estado (UF)", street: "Rua",
// es examples
    cep: "01310-100", city: "São Paulo", complement: "Oficina 2", district: "Centro", number: "123", state: "SP", street: "Calle de las Flores",
// es owner.shop
      cep: "CEP (código postal)", cepNotFound: "CEP no encontrado, completa la dirección.", cepUnavailable: "No se pudo consultar el CEP, completa la dirección.",
      city: "Ciudad", complement: "Complemento", district: "Barrio", number: "Número", state: "Estado (UF)", street: "Calle",
```

- [ ] **Step 4: Run and see it pass**

Run: `npx jest tests/unit/cep.test.ts tests/unit/locale-parity.test.ts`
Expected: PASS (locale parity also confirms the new keys exist in all three files). `examples.address` is kept for now and removed in Task 9.

- [ ] **Step 5: Commit**

```bash
./node_modules/.bin/eslint src tests && git add src/features/shops/cep.ts src/lib/input-masks.ts src/components/ui/MaskedInputs.tsx src/i18n/locales tests/unit/cep.test.ts
git commit -m "feat(shops): CEP mask and ViaCEP/BrasilAPI lookup"
```

---

### Task 9: Switch the app to the structured address (types, display, owner Shop screen)

**Files:**
- Modify: `src/features/shops/api.ts` (`PublicShop`, `PUBLIC_SHOP_COLUMNS`, `updateShopContact`), `src/components/domain/ShopInfoCard.tsx:28,33`, `app/(customer)/(tabs)/appointments.tsx:83`, `app/(owner)/shop.tsx`, `src/i18n/locales/{en,pt,es}.ts` (drop `examples.address`), `tests/e2e/fixtures.ts` (default shop), `tests/e2e/owner-shop.web.spec.ts`
- Modify tests that build a `PublicShop` or read the address: `tests/unit/shop-info-card.test.ts`, `tests/unit/use-appointment-cards.test.ts`, `tests/unit/current-shop.test.ts`, `tests/unit/use-shop-info.test.ts`
- Produces: `PublicShop = ShopAddressColumns & { id: string; name: string; phone: string | null; slug: string; whatsapp: string | null }`; `updateShopContact(supabase, shopId, input: { address: ShopAddress; phone: string; whatsapp: string })`.

**Interfaces:**
- Consumes: `addressFromColumns`, `EMPTY_ADDRESS`, `ShopAddress` (Task 7), `lookupCep`, `mergeCepResult` (Task 8), `CepInput`, `updateShopContact` (Task 7), `useCurrentShop()` (part 1).

State on the screen: `contact: { address: ShopAddress; phone: string; whatsapp: string }`. When the shop loads, `address: addressFromColumns(shop)`. The CEP field's `onChangeValue(cep)`: update `address.cep`; when `cep.replace(/\D/g, "").length === 8`, call `lookupCep`:
- `found` → `setContact` with `mergeCepResult(current.address, result.address)`, then `numberRef.current?.focus()`.
- `not-found` → toast `owner.shop.cepNotFound` (error variant), nothing cleared.
- `unavailable` → toast `owner.shop.cepUnavailable`.
A stale answer (the owner kept typing a different CEP) is ignored: remember the CEP the request was for and apply only if it still equals the field's digits.

- [ ] **Step 0: Update the unit tests that build a shop (they fail first)**

`tests/unit/shop-info-card.test.ts` line 8 builds the shop as `{ address_street: "Rua A", address_number: "10", address_city: "Recife", address_state: "PE", id: "s1", name: "Shop", phone: "(11) 3000-0000", slug: "alfa", whatsapp: "(11) 99999-0000" }` and its first test expects `view.getByText("Rua A, 10 · Recife - PE")`. In the other tests that build a `PublicShop` (`use-appointment-cards`, `current-shop`, `use-shop-info`) replace `address: null` by the eight `address_*: null` keys, or cast with `as never` where the literal is partial. Run `npx jest tests/unit/shop-info-card.test.ts` and watch it fail (the card still renders `shop.address`).

- [ ] **Step 1: Write the failing e2e checks first**

In `tests/e2e/owner-shop.web.spec.ts`:
1. Change the import to `import { defaultShop, expect, test } from "./fixtures";` (part 1 Task 14 already switched `test`/`expect` to the fixtures module; `defaultShop` is exported there).
2. After the imports add the shop the screen now reads (it comes from the slug lookup that the fixture answers, not from the spec's own `/shops` handler, so delete the `if (path.endsWith("/shops") && method === "GET") return json(route, [...])` line in `mockOwnerRest`; keep the `PATCH` branch):

```ts
test.use({ shop: { ...defaultShop, address_city: "Recife", address_number: "10", address_state: "PE", address_street: "Rua A", phone: "1133334444" } });
```

3. In the first test replace `await expect(page.getByTestId("shop-address")).toHaveValue("Rua A, 10");` with

```ts
  await expect(page.getByTestId("shop-street")).toHaveValue("Rua A");
  await expect(page.getByTestId("shop-number")).toHaveValue("10");
  await expect(page.getByTestId("shop-city")).toHaveValue("Recife");
```

4. In the second test replace the same `shop-address` assertion with `await expect(page.getByTestId("shop-street")).toHaveValue("Rua A");` and the saved-contact assertion with

```ts
  expect(calls.contact).toEqual({
    address_cep: null, address_city: "Recife", address_city_ibge: null, address_complement: null, address_district: null,
    address_number: "10", address_state: "PE", address_street: "Rua A", phone: "1155556666", whatsapp: null,
  });
```

5. Add two new tests at the end of the file:

```ts
test("typing a CEP fills the address, moves to the number and keeps every field editable", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.route("https://viacep.com.br/ws/01310100/json/", (route) =>
    route.fulfill({ body: JSON.stringify({ bairro: "Bela Vista", ibge: "3550308", localidade: "São Paulo", logradouro: "Avenida Paulista", uf: "SP" }), contentType: "application/json" }),
  );
  await page.goto("/shop");
  await expect(page.getByTestId("shop-day-1")).toBeVisible();

  await page.getByTestId("shop-cep").fill("01310100");
  await expect(page.getByTestId("shop-street")).toHaveValue("Avenida Paulista");
  await expect(page.getByTestId("shop-city")).toHaveValue("São Paulo");
  await expect(page.getByTestId("shop-state")).toHaveValue("SP");
  await expect(page.getByTestId("shop-number")).toBeFocused();

  await page.getByTestId("shop-street").fill("Rua que eu mudei");
  await expect(page.getByTestId("shop-street")).toHaveValue("Rua que eu mudei");
});

test("an unknown CEP shows a message and clears nothing", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.route("https://viacep.com.br/ws/99999999/json/", (route) => route.fulfill({ body: JSON.stringify({ erro: true }), contentType: "application/json" }));
  await page.goto("/shop");
  await expect(page.getByTestId("shop-day-1")).toBeVisible();

  await page.getByTestId("shop-street").fill("Rua que eu digitei");
  await page.getByTestId("shop-cep").fill("99999999");

  await expect(page.getByText("CEP not found, fill in the address.")).toBeVisible();
  await expect(page.getByTestId("shop-street")).toHaveValue("Rua que eu digitei");
});
```

(The page's catch-all `**/rest/v1/**` route aborts unknown REST calls; the ViaCEP URL is a different origin, so the routes above do not collide.)

- [ ] **Step 2: Run it and watch it fail**

Run (procedure in part 1 Task 14): `npx playwright test -c playwright.chrome.config.ts tests/e2e/owner-shop.web.spec.ts`
Expected: FAIL (`shop-cep` does not exist).

- [ ] **Step 3: Implement**

`src/features/shops/api.ts`:

```ts
import { addressToColumns } from "./address";
import type { ShopAddress, ShopAddressColumns } from "./address";

export type PublicShop = ShopAddressColumns & { id: string; name: string; phone: string | null; slug: string; whatsapp: string | null };

const PUBLIC_SHOP_COLUMNS =
  "id, name, slug, phone, whatsapp, address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge";

export async function updateShopContact(
  supabase: Pick<SupabaseClient, "from">,
  shopId: string,
  input: { address: ShopAddress; phone: string; whatsapp: string },
) {
  const clean = (value: string) => value.trim() || null;
  const { error } = await supabase
    .from("shops")
    .update({ ...addressToColumns(input.address), phone: clean(input.phone), whatsapp: clean(input.whatsapp) })
    .eq("id", shopId);
  if (error) throw toDomainError(error);
}
```

`ShopInfoCard.tsx`: `const address = formatShopAddress(shop);` at the top; line 28 `if (!address && !shop.phone ...)` and line 33 `{address ? <Text ...>{address}</Text> : null}`. `appointments.tsx:83`: `location: shop ? formatShopAddress(shop) || null : null`. In `tests/e2e/fixtures.ts` the default shop object swaps `address: null` for the eight `address_*: null` keys.


Then the screen. In `app/(owner)/shop.tsx`:
- imports: add `CepInput` (from `MaskedInputs`), `addressFromColumns`, `EMPTY_ADDRESS`, `ShopAddress` (from `../../src/features/shops/address`), `lookupCep`, `mergeCepResult` (from `../../src/features/shops/cep`), `useRef`, `TextInput`; remove the `CONTACT_EXAMPLE.address` entry.
- state: `const [contact, setContact] = useState<{ address: ShopAddress; phone: string; whatsapp: string }>({ address: EMPTY_ADDRESS, phone: "", whatsapp: "" });` and `const numberRef = useRef<TextInput>(null);`
- the shop effect: `if (shop) setContact({ address: addressFromColumns(shop), phone: shop.phone ?? "", whatsapp: shop.whatsapp ?? "" });`
- helpers:

```tsx
const patchAddress = (patch: Partial<ShopAddress>) => setContact((current) => ({ ...current, address: { ...current.address, ...patch } }));

const changeCep = (cep: string) => {
  patchAddress({ cep });
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return;

  void lookupCep(digits).then((result) => {
    if (result.status === "found") {
      // Ignore an answer for a CEP the owner has already changed.
      setContact((current) => (current.address.cep.replace(/\D/g, "") === digits ? { ...current, address: mergeCepResult(current.address, result.address) } : current));
      numberRef.current?.focus();
    } else {
      setFeedback({ message: t(result.status === "not-found" ? "owner.shop.cepNotFound" : "owner.shop.cepUnavailable"), variant: "error" });
    }
  });
};

const addressField = (key: keyof ShopAddress, label: string, example: string, extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
  <Input label={label} onChangeText={(value) => patchAddress({ [key]: value })} placeholder={t(example as never)} testID={`shop-${key}`} value={contact.address[key]} {...extra} />
);
```

- the first `Card` becomes:

```tsx
<Card>
  <View className="gap-3">
    <CepInput label={t("owner.shop.cep")} onChangeValue={changeCep} testID="shop-cep" value={contact.address.cep} />
    {addressField("street", t("owner.shop.street"), "examples.street")}
    {addressField("number", t("owner.shop.number"), "examples.number", { inputRef: numberRef })}
    {addressField("complement", t("owner.shop.complement"), "examples.complement")}
    {addressField("district", t("owner.shop.district"), "examples.district")}
    {addressField("city", t("owner.shop.city"), "examples.city")}
    {addressField("state", t("owner.shop.state"), "examples.state", { autoCapitalize: "characters", maxLength: 2 })}
    {field("phone", t("owner.shop.phone"))}
    {field("whatsapp", t("owner.shop.whatsapp"))}
  </View>
</Card>
```

and the `field` helper handles only `phone` / `whatsapp` now (`CONTACT_EXAMPLE = { phone: "examples.phone", whatsapp: "examples.phone" }`, `field = (key: "phone" | "whatsapp", label)` updating `contact[key]`). `save()` already calls `updateShopContact(supabase, shop.id, contact)`, which now takes the structured object.

`Input` accepts `inputRef`, `autoCapitalize` and `maxLength` (they are in `InputProps`).

- [ ] **Step 4: Run and see it pass**

Run: `npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npx jest` then `npx playwright test -c playwright.chrome.config.ts tests/e2e/owner-shop.web.spec.ts tests/e2e/field-examples.web.spec.ts`
Expected: tsc 0 errors (the Task 7/8 leftovers are gone), Jest all green, the Shop e2e specs pass.

- [ ] **Step 5: Look at it in a browser**

Per the project rule "verify UI in a browser": export the web build (part 1 Task 14), open `/shop` on `http://seed-shop.localhost:4173` as the dev owner and check, with a screenshot and `getComputedStyle`, that the new fields are styled like the other inputs (borders, font, spacing) and that the labels render in pt/es/en.

- [ ] **Step 6: Commit**

```bash
git add "app/(owner)/shop.tsx" tests/e2e/owner-shop.web.spec.ts
git commit -m "feat(owner): structured address with CEP autofill on the Shop screen"
```

---

### Task 10: Final verification and the manual run

- [ ] **Step 1: Run every check**

```bash
npx tsc --noEmit
./node_modules/.bin/eslint app src tests scripts
npm run lint
npx jest 2>&1 | tail -8
npm run test:e2e:runner
npx supabase db reset && npx supabase test db 2>&1 | tail -8
```

Expected: 0 type errors, both lints clean, Jest green, node tests green (script tests included), pgTAP all files pass. Run the full Playwright suite once (part 1 Task 14, step 4).

- [ ] **Step 2: Manual run against the local stack (Mailpit)**

```bash
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<from npx supabase status> SHOP_URL_TEMPLATE='http://{slug}.localhost:8081' \
  node scripts/create-shop.mjs --name "Barbearia Teste" --slug barbearia-teste --owner dono@teste.com
```

Open `http://127.0.0.1:54324`, take the invite link, open it: the app lands on `http://barbearia-teste.localhost:8081/reset-password` with "Create your password"; set the password; sign in; the owner opens `/shop` and fills a real CEP. Re-run the command with the same slug: it reports the slug problem and the second invited user is gone (`select email from auth.users` shows only the first). Record the three outcomes in the PR description.

- [ ] **Step 3: Update the spec status and commit**

Set `Status:` of `docs/superpowers/specs/2026-11-18-shop-onboarding-design.md` to `implemented on feat-shop-onboarding`.

```bash
git add docs
git commit -m "docs: shop onboarding implemented"
```

---

## Execution deviations

- **Task 1:** `052_create_shop.sql` reads `profiles` and `shops` columns as the test owner (`reset role` / `set local role service_role` around those assertions): `service_role` has no table privilege on `profiles`, and on `shops` only `select (id, slug)`, so the plan's version failed with "permission denied for table profiles". Mailpit/Auth behaviour unchanged.
- **Task 3:** the script test's Node warning `MODULE_TYPELESS_PACKAGE_JSON` for the imported `.ts` files is harmless (same pattern as `run-e2e-web.mjs`).
- **Task 7/8/9 ordering:** `address.ts`, `cep.ts`, `formatCepInput`, `CepInput` and the new locale texts landed in one commit before the switch of `PublicShop`, `ShopInfoCard`, the calendar location and the owner Shop screen (Task 9), as the plan ordered; `examples.address` was removed in Task 9, and `tests/unit/field-examples.test.ts` now lists the new example keys instead of `address`.
- **Task 9:** `shop.tsx` types the number-field ref with `ComponentRef<typeof TextInput>` (the plan's `useRef<TextInput>` does not satisfy the project's `Input` ref type).
