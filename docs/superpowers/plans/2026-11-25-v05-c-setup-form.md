# 0.5 Part C: Owner setup form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new owner is routed to a guided checklist (agreement, details, hours, services, team, colours, open) instead of an empty panel; the shop stays closed to customers ("Em breve") and rejects bookings until the owner opens it, which the server validates.

**Architecture:** `shops.setup_completed_at` (null = closed) is written only by the owner-only RPC `complete_shop_setup`, which re-validates through one SQL function (`shop_setup_missing`) that the read RPC `shop_setup_status` also uses, so the checklist and the server cannot disagree. The client routes owners to `/setup` while the current shop is not ready, shows customers a closed page through `ShopGate`, and each checklist step opens an EXISTING screen and returns.

**Tech Stack:** Supabase (plpgsql, pgTAP), Expo Router, React Native Web, react-query, i18next, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-25-v05-readiness-design.md` (section C, decisions 1, 2, 3, 6, 7).

## Global Constraints

- Say **estabelecimento / negócio** (en: business / shop), never "barbearia" / "barbershop".
- One-time: once `setup_completed_at` is set the checklist never returns. Owners get NO update grant on the column; only `complete_shop_setup` writes it.
- Required steps: agreement (consent `business`), details (name, WhatsApp or phone, address with CEP), shop hours, at least 1 active service, team (at least 1 active professional with working periods AND services). Optional: colours, invites.
- The column defaults to `now()` (every direct insert, seed shop and test shop is open); `create_shop` sets it to null explicitly (spec decision 1).
- Closed page text: "Em breve: <nome> está preparando a agenda", no login or signup; the legal routes stay reachable.
- `book_appointment` rejects a not-ready shop with `P0044 SHOP_NOT_READY`; `complete_shop_setup` raises `P0045 SHOP_SETUP_INCOMPLETE` with the missing keys in `detail`. Migration `0081`, pgTAP `062` (re-check the numbers on `main`, parts A and B are merged by then: A took `0080` / `061` / `P0046`).
- Depends on part A (`acceptLegalDocuments`, `LegalFooter`, `usePendingLegal`, the `/contrato` route) and part B (`/shop-link`, `ShopLinkCard`).
- Strict TDD, one commit per task, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Read-only shell commands through `rtk`. Never `supabase db reset`.
- Gates before the PR: `npm run typecheck`, root `npm run lint`, full `npx jest` (no "did not exit"), `supabase test db`, Playwright chromium + firefox + webkit whole suite per `docs/testing.md` (`.env.local` aside and restored, default base URL), static export.
- Do not push; the orchestrator opens the PR from `main`.

## File structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0081_shop_setup.sql` (new) | Column, grant, `create_shop`, `shop_setup_missing`, `shop_setup_status`, `complete_shop_setup`, booking guard |
| `supabase/tests/062_shop_setup.sql` (new) | pgTAP |
| `src/features/shops/api.ts`, `shop-route.ts`, `ShopGate.tsx` | `ready` on `PublicShop`, `coming-soon` route, closed page |
| `src/features/legal/LegalLinks.tsx` | `LegalFooter` navigates with a full page load on web (part A file) |
| `src/features/setup/api.ts`, `steps.ts`, `use-setup-status.ts` (new) | Status RPC client, pure checklist model, query hook |
| `src/features/setup/SetupStepCard.tsx`, `SetupTeamStep.tsx`, `SetupAgreementStep.tsx` (new) | Checklist UI pieces |
| `app/(owner)/setup.tsx` (new) | The checklist screen |
| `src/features/auth/session.ts`, `app/(owner)/_layout.tsx`, `app/_layout.tsx` | Owner routing while pending, tab bar hidden |
| `src/lib/errors/domain-errors.ts`, `src/i18n/locales/{pt,en,es}.ts` | Codes and texts |
| `docs/hosted-deploy.md`, `scripts/create-shop.mjs` | How to test locally, what the script tells the owner |

---

### Task 1: Database

**Files:**
- Create: `supabase/migrations/0081_shop_setup.sql`, `supabase/tests/062_shop_setup.sql`
- Modify: `src/lib/errors/domain-errors.ts`
- Test: `supabase/tests/062_shop_setup.sql`, `tests/unit/domain-errors-setup.test.ts`

**Interfaces:**
- Produces: `shops.setup_completed_at timestamptz` (default `now()`, select granted to `anon, authenticated`, no update grant); `public.shop_setup_missing(p_shop_id uuid, p_user uuid) returns text[]` (internal, no grant; keys in this order: `agreement`, `details`, `hours`, `services`, `team`); `public.shop_setup_status(p_shop_id uuid) returns jsonb` = `{ "completed": bool, "missing": [..], "professionals": [{ "id", "name", "hasHours", "hasServices" }] }` (owner only, `42501` otherwise); `public.complete_shop_setup(p_shop_id uuid) returns timestamptz` (owner only; idempotent; `P0045` when something is missing); `book_appointment` guard `P0044`.

- [ ] **Step 1: Re-check numbers, write the failing pgTAP**

Run `rtk ls supabase/migrations | tail -3; rtk ls supabase/tests | tail -3; rtk grep -rhoE "P00[0-9]{2}" supabase/migrations | sort -u | tail -3`. Expected `0080` / `061` / `P0046` after part A. Renumber this plan if not.

```sql
-- supabase/tests/062_shop_setup.sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't62-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't62-other@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'fe000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't62-customer@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'fe000000-0000-0000-0000-000000000002';
-- a directly inserted shop is open (the default), the owner "other" has one
insert into public.shops (id, name, slug, owner_user_id)
values ('fe100000-0000-0000-0000-000000000002', 'T62 Open', 'open-t62', 'fe000000-0000-0000-0000-000000000002');

-- create_shop makes a CLOSED shop
set local role service_role;
select public.create_shop('T62 New', 'new-t62', 'fe000000-0000-0000-0000-000000000001');
reset role;

select is((select setup_completed_at is not null from public.shops where slug = 'open-t62'), true, 'a directly inserted shop is open');
select is((select setup_completed_at is null from public.shops where slug = 'new-t62'), true, 'create_shop makes a closed shop');

-- the shop id of the closed shop, for the rest of the file
select set_config('t62.shop', (select id::text from public.shops where slug = 'new-t62'), false);

set local role anon;
select lives_ok($$ select setup_completed_at from public.shops $$, 'anyone can read whether a shop is open');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select throws_ok($$ update public.shops set setup_completed_at = now() where slug = 'new-t62' $$, '42501', null, 'an owner cannot open the shop by updating the column');

-- status: everything is missing at first
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["agreement","details","hours","services","team"]'::jsonb, 'a new shop lacks all five required steps');
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'completed', 'false'::jsonb, 'and is not completed');

-- who may read the status or complete the setup
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000002', true);
select throws_ok($$ select public.shop_setup_status(current_setting('t62.shop')::uuid) $$, '42501', 'FORBIDDEN', 'another owner cannot read the status');
select throws_ok($$ select public.complete_shop_setup(current_setting('t62.shop')::uuid) $$, '42501', 'FORBIDDEN', 'another owner cannot complete the setup');
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.complete_shop_setup(current_setting('t62.shop')::uuid) $$, '42501', 'FORBIDDEN', 'a customer cannot complete the setup');
reset role;
set local role anon;
select throws_ok($$ select public.complete_shop_setup('fe100000-0000-0000-0000-000000000002') $$, '42501', null, 'anon has no access to the function');
reset role;

-- the owner cannot complete it while steps are missing
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select throws_ok($$ select public.complete_shop_setup(current_setting('t62.shop')::uuid) $$, 'P0045', 'SHOP_SETUP_INCOMPLETE', 'completing with missing steps is rejected');
reset role;

-- booking a closed shop is rejected (any customer, any slot: the guard runs first)
insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('fe300000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'T62 Cut', 30, 4000);
insert into public.professionals (id, shop_id, name)
values ('fe200000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'T62 Pro');
insert into public.professional_services (id, shop_id, professional_id, service_id)
values ('fe400000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000001', 'fe300000-0000-0000-0000-000000000001');
insert into public.customers (id, shop_id, user_id, full_name, email)
values ('fe500000-0000-0000-0000-000000000001', current_setting('t62.shop')::uuid, 'fe000000-0000-0000-0000-000000000003', 'T62 Customer', 't62-customer@example.com');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select * from public.book_appointment('fe400000-0000-0000-0000-000000000001', 'fe500000-0000-0000-0000-000000000001', now() + interval '2 days', 'customer', null) $$,
  'P0044', 'SHOP_NOT_READY', 'a closed shop rejects bookings'
);
reset role;

-- satisfy the steps one by one (the data is written as the test owner, the status is read as the shop owner)
insert into public.consents (user_id, kind, version) values ('fe000000-0000-0000-0000-000000000001', 'business', '2026-11-26');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["details","hours","team"]'::jsonb, 'the agreement step is done once the business agreement is accepted (the service inserted for the booking test already satisfies services)');
reset role;

update public.shops set phone = '+55 11 90000-0000', address_cep = '01310100', address_street = 'Avenida Paulista' where id = current_setting('t62.shop')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["hours","team"]'::jsonb, 'details need a phone or WhatsApp, a CEP and a street');
reset role;

insert into public.shop_hours (shop_id, weekday, start_time, end_time) values (current_setting('t62.shop')::uuid, 1, '09:00', '18:00');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["team"]'::jsonb, 'shop hours step done');
reset role;

-- an inactive service does not count; turning it back on does
update public.services set active = false where id = 'fe300000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["services","team"]'::jsonb, 'an inactive service does not satisfy the services step');
reset role;
update public.services set active = true where id = 'fe300000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["team"]'::jsonb, 'an active service satisfies it (the professional has no hours yet, so team is still missing)');
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'professionals', '[{"id":"fe200000-0000-0000-0000-000000000001","name":"T62 Pro","hasHours":false,"hasServices":true}]'::jsonb, 'the status says what each professional lacks');
reset role;

-- an inactive professional with hours and services does not count
insert into public.professionals (id, shop_id, name, active) values ('fe200000-0000-0000-0000-000000000002', current_setting('t62.shop')::uuid, 'T62 Inactive', false);
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time) values (current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000002', 1, '09:00', '12:00');
insert into public.professional_services (id, shop_id, professional_id, service_id) values ('fe400000-0000-0000-0000-000000000002', current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000002', 'fe300000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '["team"]'::jsonb, 'an inactive professional does not satisfy the team step');
reset role;

-- hours for the active professional complete the team step (no invite needed: user_id is null)
insert into public.working_periods (shop_id, professional_id, weekday, start_time, end_time) values (current_setting('t62.shop')::uuid, 'fe200000-0000-0000-0000-000000000001', 1, '09:00', '12:00');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'missing', '[]'::jsonb, 'an active professional with hours and services, not yet invited, completes the team step');

-- completing
select isnt(public.complete_shop_setup(current_setting('t62.shop')::uuid), null, 'the owner completes the setup');
reset role;
select is((select setup_completed_at is not null from public.shops where slug = 'new-t62'), true, 'the shop is open now');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fe000000-0000-0000-0000-000000000001', true);
select is(public.complete_shop_setup(current_setting('t62.shop')::uuid), (select setup_completed_at from public.shops where slug = 'new-t62'), 'completing again returns the same timestamp');
select is(public.shop_setup_status(current_setting('t62.shop')::uuid) -> 'completed', 'true'::jsonb, 'the status reports completed');
reset role;

select * from finish();
rollback;
```

Count check: the file has 24 assertions (`select plan(24)`); after running, if pgTAP reports a different planned/run count, fix `plan(N)` to the real count of `select is/isnt/throws_ok/lives_ok` calls (do not edit assertions to fit).

`tests/unit/domain-errors-setup.test.ts`:

```ts
import { toDomainError } from "../../src/lib/errors/domain-errors";

it("maps P0044 and P0045", () => {
  expect(toDomainError({ code: "P0044" }).code).toBe("SHOP_NOT_READY");
  expect(toDomainError({ code: "P0045" }).code).toBe("SHOP_SETUP_INCOMPLETE");
});
```

- [ ] **Step 2: Run to see them fail**

Run: `rtk supabase test db` -> FAIL (column and functions missing). `rtk npx jest tests/unit/domain-errors-setup.test.ts` -> FAIL.

- [ ] **Step 3: Implement**

```sql
-- supabase/migrations/0081_shop_setup.sql
-- A business is closed to customers until its owner finishes the setup checklist. `setup_completed_at` is null while closed. The
-- default is now() so every shop inserted directly (seed, tests, dev scripts) is open; create_shop sets it to null on purpose.
alter table public.shops add column setup_completed_at timestamptz default now();

-- Whether a business is open is public information (the closed page and the booking screens read it with the name and slug).
-- Owners get NO update grant: only complete_shop_setup writes it.
grant select (setup_completed_at) on table public.shops to anon, authenticated;

-- create_shop (0070) unchanged except for setup_completed_at = null.
create or replace function public.create_shop(
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
    insert into public.shops (name, slug, owner_user_id, timezone, setup_completed_at)
    values (btrim(p_name), p_slug, p_owner_user_id, coalesce(p_timezone, 'America/Sao_Paulo'), null)
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

-- The ONE definition of "ready": the checklist (shop_setup_status) and the server check (complete_shop_setup) both use it.
create function public.shop_setup_missing(p_shop_id uuid, p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(array_remove(array[
    case when not exists (select 1 from public.consents c where c.user_id = p_user and c.kind = 'business') then 'agreement' end,
    case when not exists (
      select 1 from public.shops s
      where s.id = p_shop_id
        and btrim(s.name) <> ''
        and coalesce(nullif(btrim(s.phone), ''), nullif(btrim(s.whatsapp), '')) is not null
        and s.address_cep is not null
        and nullif(btrim(s.address_street), '') is not null
    ) then 'details' end,
    case when not exists (select 1 from public.shop_hours h where h.shop_id = p_shop_id) then 'hours' end,
    case when not exists (select 1 from public.services v where v.shop_id = p_shop_id and v.active and v.archived_at is null) then 'services' end,
    case when not exists (
      select 1 from public.professionals p
      where p.shop_id = p_shop_id and p.active and p.archived_at is null
        and exists (select 1 from public.working_periods w where w.shop_id = p.shop_id and w.professional_id = p.id)
        and exists (
          select 1 from public.professional_services ps
          join public.services v on v.id = ps.service_id and v.shop_id = ps.shop_id
          where ps.shop_id = p.shop_id and ps.professional_id = p.id
            and ps.active and ps.archived_at is null and v.active and v.archived_at is null
        )
    ) then 'team' end
  ], null), '{}'::text[]);
$$;

revoke all on function public.shop_setup_missing(uuid, uuid) from public, anon, authenticated;

create function public.shop_setup_status(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  return jsonb_build_object(
    'completed', exists (select 1 from public.shops where id = p_shop_id and setup_completed_at is not null),
    'missing', to_jsonb(public.shop_setup_missing(p_shop_id, auth.uid())),
    'professionals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'hasHours', exists (select 1 from public.working_periods w where w.shop_id = p.shop_id and w.professional_id = p.id),
        'hasServices', exists (
          select 1 from public.professional_services ps
          join public.services v on v.id = ps.service_id and v.shop_id = ps.shop_id
          where ps.shop_id = p.shop_id and ps.professional_id = p.id
            and ps.active and ps.archived_at is null and v.active and v.archived_at is null
        )
      ) order by p.created_at, p.id)
      from public.professionals p
      where p.shop_id = p_shop_id and p.active and p.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shop_setup_status(uuid) from public, anon;
grant execute on function public.shop_setup_status(uuid) to authenticated;

create function public.complete_shop_setup(p_shop_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  done timestamptz;
  missing text[];
begin
  if not public.is_shop_owner(p_shop_id) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  select setup_completed_at into done from public.shops where id = p_shop_id for update;
  if done is not null then
    return done;
  end if;

  missing := public.shop_setup_missing(p_shop_id, auth.uid());
  if cardinality(missing) > 0 then
    raise exception using errcode = 'P0045', message = 'SHOP_SETUP_INCOMPLETE', detail = array_to_string(missing, ',');
  end if;

  update public.shops set setup_completed_at = clock_timestamp() where id = p_shop_id returning setup_completed_at into done;

  return done;
end;
$$;

revoke all on function public.complete_shop_setup(uuid) from public, anon;
grant execute on function public.complete_shop_setup(uuid) to authenticated;

-- book_appointment (0017) unchanged except for the closed-shop guard. Grants are kept by create or replace.
create or replace function public.book_appointment(
  professional_service_id uuid,
  customer_id uuid,
  starts_at timestamptz,
  source public.appointment_source,
  notes text default null
)
returns setof public.appointments
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if source = 'recurrence' then
    raise exception using errcode = 'P0008', message = 'BOOKING_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.professional_services ps
    join public.shops s on s.id = ps.shop_id
    where ps.id = professional_service_id and s.setup_completed_at is null
  ) then
    raise exception using errcode = 'P0044', message = 'SHOP_NOT_READY';
  end if;

  return query
  select * from public.book_appointment_internal(
    professional_service_id, customer_id, starts_at, source, notes, null, null, null
  );
end;
$$;
```

`src/lib/errors/domain-errors.ts`, next to `P0042`:

```ts
    case "P0044":
      return new DomainError("SHOP_NOT_READY", "This business is not open for bookings yet.");
    case "P0045":
      return new DomainError("SHOP_SETUP_INCOMPLETE", "Finish the required steps before opening your agenda.");
```

and the translations wherever `SHOP_OWNER_INVALID` is translated (`rtk grep -rn SHOP_OWNER_INVALID src/i18n`), in en, pt ("Este estabelecimento ainda não está aberto para agendamentos." / "Conclua as etapas obrigatórias antes de abrir sua agenda."), es ("Este establecimiento aún no está abierto para reservas." / "Complete los pasos obligatorios antes de abrir su agenda.").

- [ ] **Step 4: Run to see them pass**

Run: `rtk supabase migration up` (applies 0081 to the running local DB, no reset), `rtk supabase test db` (the whole suite, all green: existing booking tests prove the default keeps old shops open), `rtk npx jest tests/unit/domain-errors-setup.test.ts tests/unit/locale-parity.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase src/lib/errors src/i18n tests/unit/domain-errors-setup.test.ts
git commit -m "feat(db): shop setup status, complete_shop_setup and the closed-shop booking guard"
```

---

### Task 2: Readiness on the client and the closed page

**Files:**
- Modify: `src/features/shops/api.ts`, `src/features/shops/shop-route.ts`, `src/features/shops/ShopGate.tsx`, `src/features/legal/LegalLinks.tsx`, `tests/e2e/fixtures.ts`, `src/i18n/locales/{pt,en,es}.ts`
- Test: `tests/unit/shop-route.test.ts`, `tests/unit/shop-gate.test.ts`, `tests/unit/shop-api-ready.test.ts` (new), `tests/e2e/shop-closed.web.spec.ts` (new)

**Interfaces:**
- Produces: `PublicShop.ready: boolean` (`setup_completed_at !== null`; a row without the field counts as ready); `ShopRoute` gains `{ kind: "coming-soon" }`; `resolveShopRoute` input gains `shopReady?: boolean`; i18n `shopGate.comingSoonTitle` (pt "Em breve", en "Coming soon", es "Próximamente") and `shopGate.comingSoonBody` with `{{name}}` (pt "{{name}} está preparando a agenda.", en "{{name}} is getting its agenda ready.", es "{{name}} está preparando la agenda.").
- Rule: coming-soon when the shop exists, `shopReady === false`, and the visitor is not staff of THIS shop (`staff && mySlug === currentSlug`).

- [ ] **Step 1: Write the failing tests**

Add to the `it.each` table in `tests/unit/shop-route.test.ts`:

```ts
    ["visitor on a closed shop", { ...base, shopReady: false }, { kind: "coming-soon" }],
    ["customer on a closed shop", { ...base, role: "customer", shopReady: false, signedIn: true }, { kind: "coming-soon" }],
    ["owner on their own closed shop", { ...base, mySlug: "alfa", role: "owner", shopReady: false, signedIn: true }, { kind: "app" }],
    ["professional on their own closed shop", { ...base, mySlug: "alfa", role: "professional", shopReady: false, signedIn: true }, { kind: "app" }],
    ["owner of another shop on a closed shop is redirected", { ...base, mySlug: "beta", role: "owner", shopReady: false, signedIn: true }, { kind: "redirect", slug: "beta" }],
    ["an open shop", { ...base, shopReady: true }, { kind: "app" }],
```

`tests/unit/shop-api-ready.test.ts`:

```ts
import { getShopBySlug, listPublicShops } from "../../src/features/shops/api";

const fakeSupabase = (rows: unknown[]) => ({
  from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: rows, error: null }) }), order: async () => ({ data: rows, error: null }) }) }),
});

describe("PublicShop.ready", () => {
  it("is false only when setup_completed_at is explicitly null", async () => {
    expect((await getShopBySlug(fakeSupabase([{ id: "s", name: "A", setup_completed_at: null, slug: "a" }]) as never, "a"))?.ready).toBe(false);
    expect((await getShopBySlug(fakeSupabase([{ id: "s", name: "A", setup_completed_at: "2026-11-01T00:00:00Z", slug: "a" }]) as never, "a"))?.ready).toBe(true);
    expect((await getShopBySlug(fakeSupabase([{ id: "s", name: "A", slug: "a" }]) as never, "a"))?.ready).toBe(true);
  });

  it("listPublicShops carries it too", async () => {
    expect((await listPublicShops(fakeSupabase([{ id: "s", name: "A", setup_completed_at: null, slug: "a" }]) as never))[0].ready).toBe(false);
  });
});
```

Add to `tests/unit/shop-gate.test.ts` (it mocks `useCurrentShop`, `useMyShop`, `useSupabaseSession`; also add `jest.mock("expo-router", () => ({ usePathname: jest.fn(() => "/"), useRouter: () => ({ push: jest.fn() }) }))` at the top if the file does not mock it yet):

```ts
  it("shows the closed page for a shop that is not open, without a login or signup action", async () => {
    setup({ shop: { id: "s", name: "Studio Aurora", ready: false, slug: "alfa" } }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("Coming soon")).toBeTruthy();
    expect(view.getByText("Studio Aurora is getting its agenda ready.")).toBeTruthy();
    expect(view.queryByText("navigator")).toBeNull();
    expect(view.getByTestId("legal-footer")).toBeTruthy();
  });

  it("lets the legal documents through on a closed shop", async () => {
    jest.mocked(usePathname).mockReturnValue("/privacidade");
    setup({ shop: { id: "s", name: "Studio Aurora", ready: false, slug: "alfa" } }, {});
    const view = await render(React.createElement(ShopGate, null, child()));

    expect(view.getByText("navigator")).toBeTruthy();
  });
```

(import `usePathname` from `expo-router`.) e2e `tests/e2e/shop-closed.web.spec.ts`:

```ts
import { expect, test } from "./fixtures";
import { defaultShop } from "./fixtures";

test.describe("closed shop", () => {
  test.use({ locale: "pt-BR", shop: { ...defaultShop, name: "Studio Aurora", setup_completed_at: null } });

  test("a visitor sees 'Em breve' with no login, and can still read the legal documents", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Em breve" })).toBeVisible();
    await expect(page.getByText("Studio Aurora está preparando a agenda.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toHaveCount(0);

    await page.getByRole("button", { name: "Política de Privacidade" }).click();
    await expect(page).toHaveURL(/\/privacidade/);
    await expect(page.getByRole("heading", { name: "Política de Privacidade", level: 1 })).toBeVisible();
  });
});

test.describe("open shop", () => {
  test("the default fixture shop is open", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Sign in|Entrar/ })).toBeVisible();
  });
});
```

In `tests/e2e/fixtures.ts` add `setup_completed_at: "2026-11-01T00:00:00Z",` to `defaultShop` (explicit open).

- [ ] **Step 2: Run to see them fail**

Run: `rtk npx jest tests/unit/shop-route.test.ts tests/unit/shop-api-ready.test.ts tests/unit/shop-gate.test.ts` -> FAIL.

- [ ] **Step 3: Implement**

`src/features/shops/api.ts`:

```ts
export type PublicShop = ShopAddressColumns & { id: string; name: string; phone: string | null; ready: boolean; slug: string; whatsapp: string | null };

const PUBLIC_SHOP_COLUMNS =
  "id, name, slug, phone, whatsapp, setup_completed_at, address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge";

// A row without the column (older mocks) counts as open: only an explicit null means "not open yet".
function toPublicShop(row: Record<string, unknown>): PublicShop {
  const { setup_completed_at: completedAt, ...rest } = row;

  return { ...(rest as Omit<PublicShop, "ready">), ready: completedAt !== null };
}
```

`listPublicShops` returns `((data ?? []) as Record<string, unknown>[]).map(toPublicShop)`; `getShopBySlug` returns `data?.[0] ? toPublicShop(data[0] as Record<string, unknown>) : null`. Run `rtk npx tsc --noEmit` and add `ready: true` to every test or component literal typed as `PublicShop` that it reports.

`shop-route.ts`: add `{ kind: "coming-soon" }` to `ShopRoute`, `shopReady?: boolean` to `Input`, destructure it, and before the final return:

```ts
  // A closed shop shows "Em breve" to everyone except its own staff (they are setting it up).
  if (shopReady === false && !(staff && mySlug === currentSlug)) return { kind: "coming-soon" };
```

`ShopGate.tsx`: `Message` gets `footer?: ReactNode` rendered under the action; read `shop` from `useCurrentShop()`, pass `shopReady: shop?.ready` to `resolveShopRoute`, and add before the final return:

```tsx
  if (route.kind === "coming-soon") {
    // The legal documents stay readable: they are linked from this page and from signup, and have to open without a login.
    if (LEGAL_PATHS.includes(pathname)) return <>{children}</>;

    return <Message body={t("shopGate.comingSoonBody", { name: shop?.name ?? "" })} footer={<LegalFooter />} title={t("shopGate.comingSoonTitle")} />;
  }
```

with `const pathname = usePathname();` from `expo-router`, `LEGAL_PATHS` (add `export const LEGAL_PATHS = ["/privacidade", "/termos", "/contrato"];` to `src/features/legal/index.ts`) and `LegalFooter` imported from `../legal/LegalLinks`.

`LegalLinks.tsx` `LegalFooter` (part A): the closed page renders BEFORE the navigator exists, so `router.push` has nothing to push into. Make it navigate with a full page load on the web:

```tsx
const open = (router: ReturnType<typeof useRouter>, path: string) => () => {
  if (Platform.OS === "web" && typeof window !== "undefined") window.location.assign(path);
  else router.push(path as never);
};
```

and use `onPress={open(router, "/privacidade")}` / `"/termos"` in the two footer buttons (import `Platform` from `react-native`). Add the three i18n keys to the locale files.

- [ ] **Step 4: Run to see them pass**

Run: `rtk npx jest tests/unit/shop-route.test.ts tests/unit/shop-api-ready.test.ts tests/unit/shop-gate.test.ts tests/unit/legal-links.test.ts tests/unit/locale-parity.test.ts && rtk npx tsc --noEmit`, then the e2e specs `shop-closed`, `multi-shop`, `auth`, `smoke` with the static export (every other spec exercises the open default shop).

- [ ] **Step 5: Commit**

```bash
git add -A src tests
git commit -m "feat(shops): closed shops show Em breve and expose readiness"
```

---

### Task 3: Setup status client and the pure checklist model

**Files:**
- Create: `src/features/setup/api.ts`, `src/features/setup/steps.ts`, `src/features/setup/use-setup-status.ts`
- Test: `tests/unit/setup-steps.test.ts`, `tests/unit/setup-api.test.ts`

**Interfaces:**
- Produces:
  - `type SetupStep = "agreement" | "details" | "hours" | "services" | "team"`; `type SetupProfessional = { hasHours: boolean; hasServices: boolean; id: string; name: string }`; `type SetupStatus = { completed: boolean; missing: SetupStep[]; professionals: SetupProfessional[] }`.
  - `getShopSetupStatus(supabase: Pick<SupabaseClient, "rpc">, shopId: string): Promise<SetupStatus>`; `completeShopSetup(supabase, shopId): Promise<string>`.
  - `REQUIRED_STEPS: readonly SetupStep[]` (in checklist order); `stepDone(status, step): boolean`; `progress(status): { done: number; total: number }`; `canOpen(status): boolean`; `professionalLacks(professional): Array<"hours" | "services">`.
  - `useSetupStatus(): UseQueryResult<SetupStatus>` keyed `["shop-setup-status", shopId]`, enabled for an owner with a shop id, `retry: false`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/setup-steps.test.ts
import { canOpen, professionalLacks, progress, REQUIRED_STEPS, stepDone } from "../../src/features/setup/steps";
import type { SetupStatus } from "../../src/features/setup/api";

const none: SetupStatus = { completed: false, missing: ["agreement", "details", "hours", "services", "team"], professionals: [] };

describe("setup steps", () => {
  it("lists the five required steps in checklist order", () => {
    expect(REQUIRED_STEPS).toEqual(["agreement", "details", "hours", "services", "team"]);
  });

  it("a step is done when the server does not list it as missing", () => {
    const status = { ...none, missing: ["hours", "team"] } as SetupStatus;

    expect(stepDone(status, "agreement")).toBe(true);
    expect(stepDone(status, "hours")).toBe(false);
  });

  it("counts progress out of five and opens only when nothing is missing", () => {
    expect(progress(none)).toEqual({ done: 0, total: 5 });
    expect(progress({ ...none, missing: ["team"] })).toEqual({ done: 4, total: 5 });
    expect(canOpen(none)).toBe(false);
    expect(canOpen({ ...none, missing: [] })).toBe(true);
  });

  it("says what a professional lacks", () => {
    expect(professionalLacks({ hasHours: false, hasServices: false, id: "p", name: "A" })).toEqual(["hours", "services"]);
    expect(professionalLacks({ hasHours: true, hasServices: false, id: "p", name: "A" })).toEqual(["services"]);
    expect(professionalLacks({ hasHours: true, hasServices: true, id: "p", name: "A" })).toEqual([]);
  });
});
```

```ts
// tests/unit/setup-api.test.ts
import { completeShopSetup, getShopSetupStatus } from "../../src/features/setup/api";

it("getShopSetupStatus calls the RPC with the shop id", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: { completed: false, missing: ["hours"], professionals: [] }, error: null });

  expect(await getShopSetupStatus({ rpc } as never, "s1")).toEqual({ completed: false, missing: ["hours"], professionals: [] });
  expect(rpc).toHaveBeenCalledWith("shop_setup_status", { p_shop_id: "s1" });
});

it("completeShopSetup returns the timestamp and maps P0045", async () => {
  const ok = jest.fn().mockResolvedValue({ data: "2026-11-26T10:00:00Z", error: null });

  expect(await completeShopSetup({ rpc: ok } as never, "s1")).toBe("2026-11-26T10:00:00Z");
  expect(ok).toHaveBeenCalledWith("complete_shop_setup", { p_shop_id: "s1" });
  await expect(completeShopSetup({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: "P0045" } }) } as never, "s1")).rejects.toMatchObject({ code: "SHOP_SETUP_INCOMPLETE" });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `rtk npx jest tests/unit/setup-steps.test.ts tests/unit/setup-api.test.ts` -> FAIL (modules missing).

- [ ] **Step 3: Implement**

```ts
// src/features/setup/api.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";

export type SetupStep = "agreement" | "details" | "hours" | "services" | "team";
export type SetupProfessional = { hasHours: boolean; hasServices: boolean; id: string; name: string };
export type SetupStatus = { completed: boolean; missing: SetupStep[]; professionals: SetupProfessional[] };

export async function getShopSetupStatus(supabase: Pick<SupabaseClient, "rpc">, shopId: string): Promise<SetupStatus> {
  const { data, error } = await supabase.rpc("shop_setup_status", { p_shop_id: shopId });

  if (error) throw toDomainError(error);

  return data as SetupStatus;
}

export async function completeShopSetup(supabase: Pick<SupabaseClient, "rpc">, shopId: string): Promise<string> {
  const { data, error } = await supabase.rpc("complete_shop_setup", { p_shop_id: shopId });

  if (error) throw toDomainError(error);

  return data as string;
}
```

```ts
// src/features/setup/steps.ts
import type { SetupProfessional, SetupStatus, SetupStep } from "./api";

export const REQUIRED_STEPS: readonly SetupStep[] = ["agreement", "details", "hours", "services", "team"];

export const stepDone = (status: SetupStatus, step: SetupStep) => !status.missing.includes(step);
export const progress = (status: SetupStatus) => ({ done: REQUIRED_STEPS.filter((step) => stepDone(status, step)).length, total: REQUIRED_STEPS.length });
export const canOpen = (status: SetupStatus) => status.missing.length === 0;

export function professionalLacks(professional: SetupProfessional): Array<"hours" | "services"> {
  return [...(professional.hasHours ? [] : (["hours"] as const)), ...(professional.hasServices ? [] : (["services"] as const))];
}
```

```ts
// src/features/setup/use-setup-status.ts
import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { useOwnerShopId } from "../shops/use-owner-shop-id";
import { getShopSetupStatus } from "./api";

export function useSetupStatus() {
  const { profile, supabase } = useSupabaseSession();
  const shopId = useOwnerShopId().data ?? null;

  return useQuery({
    enabled: profile?.role === "owner" && shopId !== null,
    queryFn: () => getShopSetupStatus(supabase, shopId ?? ""),
    queryKey: ["shop-setup-status", shopId],
    retry: false,
  });
}
```

- [ ] **Step 4: Run to see them pass**

Run: `rtk npx jest tests/unit/setup-steps.test.ts tests/unit/setup-api.test.ts && rtk npx tsc --noEmit` -> PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/setup tests/unit/setup-steps.test.ts tests/unit/setup-api.test.ts
git commit -m "feat(setup): setup status api and checklist model"
```

---

### Task 4: Owner routing while the shop is closed

**Files:**
- Modify: `src/features/auth/session.ts`, `app/_layout.tsx`, `app/(owner)/_layout.tsx`
- Create: `src/features/setup/use-setup-pending.ts`
- Test: `tests/unit/auth-redirect.test.ts` (part A's file, extend), `tests/unit/owner-layout-declares-screens.test.ts` (must keep passing after adding `setup.tsx`), `tests/unit/use-setup-pending.test.ts`

**Interfaces:**
- Produces: `useSetupPending(): boolean` (`true` only for an owner whose current shop has `ready === false`); `resolveAuthRedirect({ ..., ownerSetupPending })`: while pending, an owner on a panel root (`agenda`, `revenue`, `manage`, `settings` inside `(owner)`) goes to `/setup`; with nothing pending an owner on `/setup` goes to `/agenda`. Every other owner screen the steps open (`shop`, `services`, `professionals`, `professional-new`, `professional-profile`, `schedule`, `appearance`, `language`) stays reachable. The owner tab bar is hidden while pending.
- Part A hook-up: `usePendingLegal(setupComplete)` receives `!pending`, so an owner is asked for the business agreement by the gate only after opening (spec decision 2).

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/auth-redirect.test.ts`:

```ts
describe("owner setup pending", () => {
  const owner = { profileRole: "owner", session: sessionStub } as const;

  it.each(["agenda", "revenue", "manage", "settings"])("sends the owner from the %s tab to /setup", (tab) => {
    expect(resolveAuthRedirect({ ...owner, ownerSetupPending: true, segments: ["(owner)", tab] })).toBe("/setup");
  });

  it.each(["shop", "services", "professionals", "professional-new", "professional-profile", "schedule", "appearance", "setup", "shop-link"])("lets the owner open /%s while pending", (screen) => {
    expect(resolveAuthRedirect({ ...owner, ownerSetupPending: true, segments: ["(owner)", screen] })).toBeNull();
  });

  it("sends an owner with nothing pending away from /setup", () => {
    expect(resolveAuthRedirect({ ...owner, ownerSetupPending: false, segments: ["(owner)", "setup"] })).toBe("/agenda");
  });

  it("never affects other roles", () => {
    expect(resolveAuthRedirect({ ownerSetupPending: true, profileRole: "customer", segments: ["(customer)", "(tabs)", "home"], session: sessionStub })).toBeNull();
  });
});
```

`tests/unit/use-setup-pending.test.ts`: `renderHook(useSetupPending)` with `useSupabaseSession` and `useCurrentShop` mocked (as in `tests/unit/shop-gate.test.ts`): owner + `shop.ready === false` -> `true`; owner + ready -> `false`; owner + `shop: null` -> `false`; customer + not ready -> `false`; professional -> `false`.

- [ ] **Step 2: Run to see them fail**

Run: `rtk npx jest tests/unit/auth-redirect.test.ts tests/unit/use-setup-pending.test.ts` -> FAIL.

- [ ] **Step 3: Implement**

`src/features/setup/use-setup-pending.ts`:

```ts
import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "../shops/CurrentShopProvider";

// An owner is always on their own shop's address (ShopGate redirects any other host), so the current shop IS theirs.
export function useSetupPending(): boolean {
  const { profile } = useSupabaseSession();
  const { shop } = useCurrentShop();

  return profile?.role === "owner" && shop?.ready === false;
}
```

`session.ts`: add `ownerSetupPending?: boolean` to the input and, after the `requiredRole` match check (the owner is in the owner group), before the final return:

```ts
const OWNER_PANEL_ROOTS = new Set(["agenda", "revenue", "manage", "settings"]);
// ...
  if (profileRole === "owner" && group === "(owner)") {
    const screen = segments[segments.length - 1];

    if (ownerSetupPending && OWNER_PANEL_ROOTS.has(screen)) return "/setup";
    if (!ownerSetupPending && screen === "setup") return "/agenda";
  }
```

(The existing `if (!requiredRole || profileRole === requiredRole) return null;` returns early for a matching role: move the owner block above it.)

`app/_layout.tsx` (`RootNavigator`): `const setupPending = useSetupPending();`, pass `ownerSetupPending: setupPending` to `resolveAuthRedirect` (add to the `useMemo` deps) and call `usePendingLegal(!setupPending)` from part A.

`app/(owner)/_layout.tsx`: add `"setup"` to `ACCOUNT_SCREENS`? No: `setup` is not reached from a tab. Add a new constant `const SETUP_SCREENS = ["setup"] as const;`, spread it in the declared screens list (`[...MANAGE_SCREENS, ...ACCOUNT_SCREENS, ...AGENDA_SCREENS, ...SETUP_SCREENS]`; the layout guard test requires every file to be named in the layout), and hide the bar while pending:

```tsx
const setupPending = useSetupPending();
// ...
tabBar={({ emitter, navigateToTab, state }) =>
  setupPending ? null : (
    <Screen className="bg-surface" edges={["bottom", "left", "right"]}> ... </Screen>
  )
}
```

`highlight`: unchanged. The layout guard test needs the file to exist, so create `app/(owner)/setup.tsx` now with a stub that Task 5 replaces:

```tsx
export default function OwnerSetupScreen() {
  return null;
}
```

Add `"/setup"` to `ROOT_ROUTES` in `src/lib/navigation/parents.ts` (the coverage test demands every route is a root or has a parent).

- [ ] **Step 4: Run to see them pass**

Run: `rtk npx jest tests/unit/auth-redirect.test.ts tests/unit/use-setup-pending.test.ts tests/unit/owner-layout-declares-screens.test.ts tests/unit/route-parents-coverage.test.ts tests/unit/root-layout.test.ts && rtk npx tsc --noEmit` -> PASS. The existing owner e2e specs run against shops with `setup_completed_at` set (fixtures), so they must stay green: run `owner-shell`, `owner-profile`, `back-navigation` e2e now.

- [ ] **Step 5: Commit**

```bash
git add -A src app tests
git commit -m "feat(setup): route owners of a closed shop to /setup and hide the panel"
```

---

### Task 5: The checklist screen

**Files:**
- Create: `app/(owner)/setup.tsx` (replace the placeholder), `src/features/setup/SetupStepCard.tsx`, `src/features/setup/SetupAgreementStep.tsx`, `src/features/setup/SetupTeamStep.tsx`
- Modify: `src/i18n/locales/{pt,en,es}.ts`
- Test: `tests/unit/setup-screen.test.ts`, `tests/unit/setup-team-step.test.ts`

**Interfaces:**
- Consumes: `useSetupStatus`, `stepDone`, `progress`, `canOpen`, `professionalLacks`, `completeShopSetup`, `acceptLegalDocuments` (part A), `useOwnerAsProfessional` (existing), `SignOutButton`.
- Produces: test IDs `setup-progress`, `setup-step-<key>` (card), `setup-step-<key>-done` (check mark when done), `setup-agreement-read`, `setup-agreement-accept`, `setup-details-open`, `setup-hours-open`, `setup-services-open`, `setup-team-serve` (Toggle), `setup-team-add`, `setup-professional-<id>`, `setup-colours-open`, `setup-open`.
- Navigation per step: agreement -> `/contrato` (read) + inline accept; details and hours -> `/shop`; services -> `/services`; team -> `/professional-new` (add) and per-professional shortcuts `{ pathname: "/schedule", params: { professional: id } }` and `{ pathname: "/professional-profile", params: { id } }`; colours -> `/appearance`.
- Status refetch: the screen calls `refetch` on focus (`useFocusEffect` from `expo-router`), so coming back from a step screen shows the new state.
- i18n namespace `setup`:

| key | pt | en | es |
| --- | --- | --- | --- |
| `title` | Vamos abrir seu estabelecimento | Let's open your business | Vamos a abrir su establecimiento |
| `intro` | Complete as etapas obrigatórias. Seus clientes só veem seu estabelecimento depois que você abrir a agenda. | Complete the required steps. Your customers only see your business after you open the agenda. | Complete los pasos obligatorios. Sus clientes solo verán su establecimiento después de que abra la agenda. |
| `progress` | {{done}} de {{total}} etapas obrigatórias | {{done}} of {{total}} required steps | {{done}} de {{total}} pasos obligatorios |
| `optional` | Opcional | Optional | Opcional |
| `open` | Abrir | Open | Abrir |
| `review` | Revisar | Review | Revisar |
| `agreement.title` | Contrato do Estabelecimento | Business agreement | Contrato del establecimiento |
| `agreement.hint` | Leia e aceite os termos de uso da Zenc pelo seu estabelecimento. | Read and accept Zenc's terms for your business. | Lea y acepte los términos de Zenc para su establecimiento. |
| `agreement.read` | Ler o contrato | Read the agreement | Leer el contrato |
| `agreement.accept` | Li e aceito | I have read and accept | He leído y acepto |
| `details.title` | Dados do estabelecimento | Business details | Datos del establecimiento |
| `details.hint` | Nome, WhatsApp ou telefone e endereço com CEP. | Name, WhatsApp or phone, and address with postcode. | Nombre, WhatsApp o teléfono y dirección con código postal. |
| `hours.title` | Horário de funcionamento | Opening hours | Horario de funcionamiento |
| `hours.hint` | Os dias e horários em que você atende. | The days and times you are open. | Los días y horarios en que atiende. |
| `services.title` | Serviços | Services | Servicios |
| `services.hint` | Cadastre pelo menos um serviço ativo. | Add at least one active service. | Registre al menos un servicio activo. |
| `team.title` | Equipe | Team | Equipo |
| `team.hint` | Pelo menos um profissional com horários e serviços. Convites são opcionais: você pode configurar tudo antes de o profissional aceitar. | At least one professional with hours and services. Invites are optional: you can set everything up before they accept. | Al menos un profesional con horarios y servicios. Las invitaciones son opcionales: puede configurarlo todo antes de que acepte. |
| `team.serve` | Eu atendo | I serve customers myself | Yo atiendo |
| `team.serveHint` | Você aparece na lista de agendamento com seus horários e serviços. | You appear in the booking list with your own hours and services. | Aparece en la lista de reservas con sus horarios y servicios. |
| `team.add` | Adicionar profissional | Add a professional | Agregar profesional |
| `team.lacksHours` | Falta cadastrar os horários. | Hours are missing. | Faltan los horarios. |
| `team.lacksServices` | Falta escolher os serviços. | Services are missing. | Faltan los servicios. |
| `team.addHours` | Cadastrar horários | Add hours | Registrar horarios |
| `team.addServices` | Escolher serviços | Choose services | Elegir servicios |
| `colours.title` | Cores | Colours | Colores |
| `colours.hint` | Deixe a página do seu estabelecimento com a sua cara. | Make your business page look like you. | Dé a su página el aspecto de su marca. |
| `finish.title` | Abrir minha agenda | Open my agenda | Abrir mi agenda |
| `finish.hint` | Quando as etapas obrigatórias estiverem completas, você pode abrir. | Once the required steps are complete you can open. | Cuando los pasos obligatorios estén completos, podrá abrir. |
| `finish.error` | Não foi possível abrir a agenda. Confira as etapas e tente de novo. | Could not open the agenda. Check the steps and try again. | No se pudo abrir la agenda. Revise los pasos e inténtelo de nuevo. |
| `loadError` | Não foi possível carregar as etapas. | Could not load the steps. | No se pudieron cargar los pasos. |

- [ ] **Step 1: Write the failing tests**

`tests/unit/setup-team-step.test.ts`: mock `expo-router` (`useRouter: () => ({ push: mockPush })`), `useOwnerAsProfessional` (returns `{ active: false, isLoading: false, professionalId: null, toggle: { isPending: false, mutate: mockToggle } }`) and render `SetupTeamStep` with `professionals = [{ hasHours: false, hasServices: true, id: "p1", name: "Ana" }, { hasHours: true, hasServices: true, id: "p2", name: "Bia" }]` (language en). Assert: row `setup-professional-p1` shows "Hours are missing." and not "Services are missing."; row `setup-professional-p2` shows no lack text; pressing "Add hours" pushes `{ params: { professional: "p1" }, pathname: "/schedule" }`; pressing `setup-team-add` pushes `"/professional-new"`; changing the `setup-team-serve` switch calls `mockToggle(true, expect.anything())`.

`tests/unit/setup-screen.test.ts`: mock `useSetupStatus` (returns `{ data, isError, isLoading, refetch }`), `useSupabaseSession`, `expo-router` (`useRouter`, `useFocusEffect: (callback) => callback()`), `completeShopSetup` and `acceptLegalDocuments`. Cases (language en):
1. with `missing` all five: `setup-progress` reads "0 of 5 required steps", every `setup-step-<key>` has no `-done` mark, `setup-open` is disabled (`accessibilityState.disabled`).
2. with `missing: ["agreement"]`: the other four show the done mark, "4 of 5 required steps".
3. pressing `setup-details-open` and `setup-hours-open` pushes `/shop`; `setup-services-open` pushes `/services`; `setup-colours-open` pushes `/appearance`; `setup-agreement-read` pushes `/contrato`.
4. pressing `setup-agreement-accept` calls `acceptLegalDocuments(supabase, ["business"])` and then refetches the status.
5. with `missing: []`: `setup-open` is enabled; pressing it calls `completeShopSetup(supabase, "s1")`, then invalidates `["current-shop"]` and `["shop-setup-status"]` and pushes `/shop-link`.
6. a failing `completeShopSetup` shows the `finish.error` text.
7. `isError` shows `loadError` with a retry button.

- [ ] **Step 2: Run to see them fail**

Run: `rtk npx jest tests/unit/setup-team-step.test.ts tests/unit/setup-screen.test.ts` -> FAIL (components missing).

- [ ] **Step 3: Implement**

`src/features/setup/SetupStepCard.tsx`:

```tsx
import { CheckCircle2, Circle } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";

type Props = PropsWithChildren<{ done: boolean | null; hint: string; optionalLabel?: string; stepKey: string; title: string }>;

// One checklist step: a status mark, the title (and "Opcional" tag), a hint and the actions as children.
export function SetupStepCard({ children, done, hint, optionalLabel, stepKey, title }: Props) {
  const colors = useColors();

  return (
    <View className="gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4" testID={`setup-step-${stepKey}`}>
      <View className="flex-row items-center gap-3">
        {done ? <CheckCircle2 color={colors.primary[600]} size={22} testID={`setup-step-${stepKey}-done`} /> : <Circle color={colors.neutral[400]} size={22} />}
        <Text className="flex-1 text-base font-sans-semibold text-ink">{title}</Text>
        {optionalLabel ? <Text className="text-xs font-sans-medium uppercase text-neutral-500">{optionalLabel}</Text> : null}
      </View>
      <Text className="text-sm font-sans text-neutral-600">{hint}</Text>
      {children}
    </View>
  );
}
```

`src/features/setup/SetupAgreementStep.tsx`: props `{ done: boolean; onAccepted: () => void }`; renders `SetupStepCard stepKey="agreement"` with `Button` `setup-agreement-read` (outline, `router.push("/contrato")`) and, when not done, `Button` `setup-agreement-accept` that runs a `useMutation` `acceptLegalDocuments(supabase, ["business"])` then `onAccepted()`; shows `errorMessage(...)` in a `Toast` on failure.

`src/features/setup/SetupTeamStep.tsx`: props `{ done: boolean; professionals: SetupProfessional[]; onChanged: () => void }`; uses `useOwnerAsProfessional()`; renders the card (`stepKey="team"`), a `Toggle` row `setup-team-serve` with `t("setup.team.serve")`/`t("setup.team.serveHint")` whose `onValueChange` calls `asProfessional.toggle.mutate(on, { onSettled: onChanged })`, one `setup-professional-<id>` row per professional with the name, one line per entry of `professionalLacks(professional)` (`setup.team.lacksHours` / `setup.team.lacksServices`) and a small outline button for each (`setup.team.addHours` pushes `{ params: { professional: id }, pathname: "/schedule" }`, `setup.team.addServices` pushes `{ params: { id }, pathname: "/professional-profile" }`), and the `setup-team-add` button (`router.push("/professional-new")`).

`app/(owner)/setup.tsx`:

```tsx
import { useFocusEffect, useRouter } from "expo-router";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { SignOutButton } from "../../src/features/account/SignOutButton";
import { completeShopSetup } from "../../src/features/setup/api";
import { SetupAgreementStep } from "../../src/features/setup/SetupAgreementStep";
import { SetupStepCard } from "../../src/features/setup/SetupStepCard";
import { SetupTeamStep } from "../../src/features/setup/SetupTeamStep";
import { canOpen, progress, stepDone } from "../../src/features/setup/steps";
import { useSetupStatus } from "../../src/features/setup/use-setup-status";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerSetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shopId = useOwnerShopId().data ?? null;
  const status = useSetupStatus();
  const refetch = status.refetch;
  // Each step opens an existing screen; coming back must show what it changed.
  useFocusEffect(useCallback(() => { void refetch(); }, [refetch]));

  const open = useMutation({
    mutationFn: () => completeShopSetup(supabase, shopId ?? ""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["current-shop"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-setup-status"] });
      router.push("/shop-link");
    },
  });
  const go = (path: string) => () => router.push(path as never);

  if (status.isError) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Text className="text-base font-sans text-danger-500">{t("setup.loadError")}</Text>
          <Button label={t("common.tryAgain")} onPress={() => void refetch()} />
        </View>
      </Screen>
    );
  }
  const data = status.data;
  const done = (step: Parameters<typeof stepDone>[1]) => (data ? stepDone(data, step) : false);
  const counted = data ? progress(data) : { done: 0, total: 5 };

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right", "bottom"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl leading-[44px] font-display-bold text-ink">{t("setup.title")}</Text>
            <Text className="text-base font-sans text-neutral-700">{t("setup.intro")}</Text>
            <Text className="text-sm font-sans-medium text-primary-600" testID="setup-progress">{t("setup.progress", counted)}</Text>

            <SetupAgreementStep done={done("agreement")} onAccepted={() => void refetch()} />
            <SetupStepCard done={done("details")} hint={t("setup.details.hint")} stepKey="details" title={t("setup.details.title")}>
              <Button label={done("details") ? t("setup.review") : t("setup.open")} onPress={go("/shop")} size="sm" testID="setup-details-open" variant="outline" />
            </SetupStepCard>
            <SetupStepCard done={done("hours")} hint={t("setup.hours.hint")} stepKey="hours" title={t("setup.hours.title")}>
              <Button label={done("hours") ? t("setup.review") : t("setup.open")} onPress={go("/shop")} size="sm" testID="setup-hours-open" variant="outline" />
            </SetupStepCard>
            <SetupStepCard done={done("services")} hint={t("setup.services.hint")} stepKey="services" title={t("setup.services.title")}>
              <Button label={done("services") ? t("setup.review") : t("setup.open")} onPress={go("/services")} size="sm" testID="setup-services-open" variant="outline" />
            </SetupStepCard>
            <SetupTeamStep done={done("team")} onChanged={() => void refetch()} professionals={data?.professionals ?? []} />
            <SetupStepCard done={null} hint={t("setup.colours.hint")} optionalLabel={t("setup.optional")} stepKey="colours" title={t("setup.colours.title")}>
              <Button label={t("setup.open")} onPress={go("/appearance")} size="sm" testID="setup-colours-open" variant="outline" />
            </SetupStepCard>

            <SetupStepCard done={null} hint={t("setup.finish.hint")} stepKey="open" title={t("setup.finish.title")}>
              <Button disabled={!data || !canOpen(data) || open.isPending} label={t("setup.finish.title")} onPress={() => open.mutate()} size="lg" testID="setup-open" />
            </SetupStepCard>
            <Toast message={open.isError ? errorMessage(open.error, t, t("setup.finish.error")) : ""} onDismiss={() => open.reset()} variant="error" visible={open.isError} />
            <SignOutButton />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

(`SetupStepCard` types `done: boolean | null`; `null` shows the empty circle without a check, used by the optional and final cards.) Add the `setup.*` keys of the table to the three locale files. If `SignOutButton` expects a different export or props, read `src/features/account/SignOutButton.tsx` first and adapt the one line.

- [ ] **Step 4: Run to see them pass**

Run: `rtk npx jest tests/unit/setup-team-step.test.ts tests/unit/setup-screen.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts tests/unit/owner-layout-declares-screens.test.ts && rtk npx tsc --noEmit` -> PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src app tests
git commit -m "feat(setup): the owner's guided setup checklist"
```

---

### Task 6: End-to-end flow, docs and the local test path

**Files:**
- Create: `tests/e2e/owner-setup.web.spec.ts`
- Modify: `docs/hosted-deploy.md`, `scripts/create-shop.mjs` (+ `scripts/create-shop.test.mjs`), `docs/project-status.md`

- [ ] **Step 1: Write the e2e spec**

`tests/e2e/owner-setup.web.spec.ts` (copy `signInAsOwner` from `owner-shell.web.spec.ts`; owner id `55555555-5555-4555-8555-555555555555`). Use `test.use({ locale: "pt-BR", interceptShops: false })` and answer the shop lookups yourself so `setup_completed_at` can flip: a closure variable `state = { completedAt: null as string | null, missing: [...] }`; `page.route("**/rest/v1/shops?*")` for `slug=eq.` returns `[{ ...defaultShop, setup_completed_at: state.completedAt }]`; `POST **/rpc/get_my_shop` returns `[{ shop_id: defaultShop.id, slug: "shop-a" }]`; `POST **/rpc/shop_setup_status` returns `{ completed: state.completedAt !== null, missing: state.missing, professionals: [...] }`; `POST **/rpc/accept_legal_documents` removes `"agreement"` from `state.missing`; `POST **/rpc/complete_shop_setup` sets `state.completedAt`. Also answer `get_current_profile` (owner; the consents lookup is answered by the `page` fixture's default, so the part A gate stays quiet) and the REST calls the opened screens need (copy from `owner-shell` and `owner-shop` specs; unknown calls `route.abort()`).

Cases:
1. A new owner opening `/agenda` lands on `/setup`, sees "0 de 5 etapas obrigatórias", no tab bar (`tab-agenda` count 0), and `setup-open` is disabled.
2. `setup-details-open` opens `/shop`; after the test sets `state.missing` without `details`/`hours` and the owner uses the back button, the app returns to `/setup` and shows "3 de 5 etapas obrigatórias" (the redirect from `/manage` plus the focus refetch).
3. The agreement: `setup-agreement-read` opens `/contrato`; back; `setup-agreement-accept` posts `accept_legal_documents` with `[{ kind: "business", version: <current> }]` and the step shows its done mark.
4. With `missing: []`, `setup-open` enables; clicking it posts `complete_shop_setup`, and the owner lands on `/shop-link` (part B) with the QR visible and the tab bar back; navigating to `/setup` afterwards redirects to `/agenda`.
5. Server rejection: `complete_shop_setup` answers `400 { code: "P0045", message: "SHOP_SETUP_INCOMPLETE" }`: the error toast shows and the owner stays on `/setup`.

Run it with the static export (steps in `docs/testing.md`; `.env.local` aside, restore afterwards). Expected: PASS. If a mocked screen needs REST calls not listed above, extend the mock rather than changing the product code.

- [ ] **Step 2: Docs and script**

- `docs/hosted-deploy.md`, new section "New shops start closed": a shop created by `scripts/create-shop.mjs` has `setup_completed_at = null`; its owner finishes the checklist at `<slug>.zencpro.app`, which opens the agenda and shows the link and QR. Until then visitors see "Em breve". Existing shops (and every seed or test shop) are open because the column defaults to `now()`.
- **Local test of the form with the dev owner account** (also put these lines in `docs/testing.md`): run in the local database (never `db reset`)

```sql
-- close the dev owner's shop and forget the business agreement, so the checklist starts from the top
update public.shops set setup_completed_at = null where owner_user_id = (select id from auth.users where email = 'owner@teste.com');
delete from public.consents where kind = 'business' and user_id = (select id from auth.users where email = 'owner@teste.com');
```

and to undo it: `update public.shops set setup_completed_at = now() where owner_user_id = (select id from auth.users where email = 'owner@teste.com');`. The account keeps its services, hours and professionals, so only the agreement and the final "Abrir minha agenda" are pending: delete some of them to see the other steps.
- `scripts/create-shop.mjs`: the success message gains a line: `The owner must finish the setup checklist at <url> before customers can book.`; update `scripts/create-shop.test.mjs` to expect it (write the test first, run `rtk node --test scripts/create-shop.test.mjs`, see it fail, then change the script).
- `docs/project-status.md`: one line, "Part C (owner setup form) done."

- [ ] **Step 3: Run every gate**

Run from the repo root: `rtk npx tsc --noEmit`; `rtk npm run lint`; `rtk npx jest` (no "did not exit"); `rtk supabase test db`; Playwright chromium, firefox and webkit whole suites per `docs/testing.md` (`.env.local` moved aside with a restoring trap, default base URL); static export. Restore `.env.local`; report whether Metro on 8081 needed a restart.
Expected: all green; put the real numbers in the PR description.

- [ ] **Step 4: Browser check on the real local DB**

Apply the SQL above for the dev owner (`owner@teste.com`), open `http://<slug>.localhost:<port>` signed in as the owner at 390 px: confirm the redirect to `/setup`, the progress count, each step button, the agreement accept, "Abrir minha agenda" and the landing on the link screen; then open the same address in a private window as a visitor and confirm "Em breve" before opening and the normal login after. Take screenshots. Undo the SQL (or leave the shop open) and say so in the report.

- [ ] **Step 5: Commit**

```bash
git add -A tests docs scripts
git commit -m "feat(setup): e2e flow, local test path and deploy notes"
```
