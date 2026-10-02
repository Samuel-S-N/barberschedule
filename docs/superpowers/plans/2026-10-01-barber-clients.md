# Barber Clients and Day Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Clients" tab (list, lapsed filter, detail with WhatsApp/call, stats, history and a private note) and a day-summary card on the barber Agenda.

**Architecture:** One migration adds a notes table (no direct access) and three RPCs plus an `is_my_client` helper. The front adds a small API/format layer, three routes under `app/(barber)/clients/`, a 4th tab, and a pure `buildDaySummary` feeding a `DaySummaryCard` in `my-agenda.tsx`.

**Tech Stack:** Supabase/Postgres + pgTAP, Expo Router, NativeWind, TanStack Query, i18next (en/es/pt), Jest + Testing Library, Playwright (REST mocked).

**Spec:** `docs/superpowers/specs/2026-10-01-barber-clients-design.md`

## Global Constraints

- Worktree `/home/samuel/projects/barberschedule/.claude/worktrees/barber-clients`, branch `feat-barber-clients`, stacked on `feat-barber-reports` (#22). Migration `0037`, pgTAP `022` (UUID prefix `ad`). Local Supabase only; `node_modules` symlinked.
- A barber only ever sees clients they served or created; no money on the client screens; the private note is readable only by its author (table has RLS and no grants; RPC access only).
- New error code `P0028` = `CUSTOMER_NOTE_INVALID`; `P0007` (`CUSTOMER_UNAVAILABLE`) for "not your client"; `P0019` not a barber; `P0014` bad paging.
- No plural-dependent strings: counts appear as `Label: N`. Every string in en/es/pt (locale-parity test). `className` only on plain RN elements. Strict TDD; Jest with `--forceExit`; kill processes by PID, never `pkill -f`; `rtk` for raw-read shell output.
- E2E with the Expo dev server on 4173 needs `EXPO_NO_DOTENV=1` **and no `.env.local` in the worktree** (move it aside); the local browser check needs `.env.local` (copy from the main checkout, remove afterwards).

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0037_barber_clients.sql`, `supabase/tests/022_barber_clients.sql` | schema, helper, RPCs, pgTAP |
| `src/features/clients/{format,api}.ts` | WhatsApp/tel URLs, days since, RPC client |
| `src/features/appointments/day-summary.ts`, `src/components/domain/DaySummaryCard.tsx` | summary logic and card |
| `app/(barber)/clients/{_layout,index,[id]}.tsx`, `app/(barber)/_layout.tsx` | the Clients tab |
| `app/(barber)/my-agenda.tsx` | summary card wiring |
| `src/lib/errors/domain-errors.ts`, `src/i18n/locales/*.ts` | error code and strings |
| `tests/unit/{client-format,day-summary,day-summary-card}.test.ts(x)`, `tests/integration/barber-clients.test.ts`, `tests/e2e/barber-clients.web.spec.ts` | tests |

---

### Task 1: Clients in the database

**Files:** Create `supabase/migrations/0037_barber_clients.sql`, `supabase/tests/022_barber_clients.sql`.

**Interfaces:** Produces `is_my_client(uuid)`, `list_my_customers(...)`, `get_my_customer(uuid) returns jsonb`, `set_my_customer_note(uuid, text) returns void` exactly as in the spec.

- [ ] **Step 1: Failing pgTAP test** — `supabase/tests/022_barber_clients.sql`

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't22-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't22-barber-a@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 't22-barber-b@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'ad000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 't22-customer@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'ad000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id in ('ad000000-0000-0000-0000-000000000002', 'ad000000-0000-0000-0000-000000000003');

insert into public.shops (id, name, owner_user_id)
values ('ad100000-0000-0000-0000-000000000001', 'T22 Shop', 'ad000000-0000-0000-0000-000000000001');

insert into public.barbers (id, shop_id, user_id, name)
values
  ('ad200000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000002', 'Barber A'),
  ('ad200000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'ad000000-0000-0000-0000-000000000003', 'Barber B');

insert into public.customers (id, shop_id, full_name, email, phone, created_by_barber_id)
values
  ('ad300000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'Old Client', 'old@example.com', '11911110001', null),
  ('ad300000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'Recent Client', 'recent@example.com', '11922220002', null),
  ('ad300000-0000-0000-0000-000000000003', 'ad100000-0000-0000-0000-000000000001', 'Other Barber Client', 'other@example.com', '11933330003', null),
  ('ad300000-0000-0000-0000-000000000004', 'ad100000-0000-0000-0000-000000000001', 'Created Only', null, '11944440004', 'ad200000-0000-0000-0000-000000000001'),
  ('ad300000-0000-0000-0000-000000000005', 'ad100000-0000-0000-0000-000000000001', 'Returning Old', 'returning@example.com', null, null);

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values
  ('ad400000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'Cut', 30, 4000),
  ('ad400000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'Beard', 30, 3000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('ad500000-0000-0000-0000-000000000001', 'ad100000-0000-0000-0000-000000000001', 'ad200000-0000-0000-0000-000000000001', 'ad400000-0000-0000-0000-000000000001'),
  ('ad500000-0000-0000-0000-000000000002', 'ad100000-0000-0000-0000-000000000001', 'ad200000-0000-0000-0000-000000000001', 'ad400000-0000-0000-0000-000000000002'),
  ('ad500000-0000-0000-0000-000000000003', 'ad100000-0000-0000-0000-000000000001', 'ad200000-0000-0000-0000-000000000002', 'ad400000-0000-0000-0000-000000000001');

-- one appointment `back` days ago (negative = in the future) at 15:00 UTC, shifted by `hours` to avoid overlaps
create function pg_temp.appt(barber uuid, customer uuid, service_name text, status public.appointment_status, back integer, hours integer default 0)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'ad100000-0000-0000-0000-000000000001', barber, customer, bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours' + hours * interval '1 hour') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes' + hours * interval '1 hour') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes' + hours * interval '1 hour') at time zone 'UTC',
    status, service_name, 30, 4000, 0
  from public.barber_services bs
  join public.services s on s.id = bs.service_id
  where bs.barber_id = barber and s.name = service_name
$$;

select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000001', 'Cut', 'completed', 60);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000001', 'Cut', 'completed', 70);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000002', 'Beard', 'completed', 3);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000002', 'Cut', 'completed', 10);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000002', 'Cut', 'no_show', 20);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000005', 'Cut', 'completed', 90);
select pg_temp.appt('ad200000-0000-0000-0000-000000000001', 'ad300000-0000-0000-0000-000000000005', 'Cut', 'scheduled', -2);
select pg_temp.appt('ad200000-0000-0000-0000-000000000002', 'ad300000-0000-0000-0000-000000000003', 'Cut', 'completed', 5);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::int from public.list_my_customers()), 4, 'a barber lists the clients they served or created');
select is((select count(*)::int from public.list_my_customers() where full_name = 'Other Barber Client'), 0, 'another barber''s client is never listed');
select is((select full_name from public.list_my_customers() limit 1), 'Recent Client', 'clients are ordered by last visit, newest first');
select is((select full_name from (select * from public.list_my_customers()) l order by last_visit_at desc nulls last offset 3 limit 1), 'Created Only', 'a client with no visit yet comes last');
select is((select visits from public.list_my_customers() where full_name = 'Recent Client'), 2, 'visits count completed appointments with this barber');
select is((select is_lapsed from public.list_my_customers() where full_name = 'Old Client'), true, 'no visit in 45+ days and nothing booked is lapsed');
select is((select is_lapsed from public.list_my_customers() where full_name = 'Returning Old'), false, 'an upcoming appointment means not lapsed');
select is((select count(*)::int from public.list_my_customers(only_lapsed => true)), 1, 'the lapsed filter returns only lapsed clients');
select is((select count(*)::int from public.list_my_customers(search => 'recent')), 1, 'search matches the name');
select is((select count(*)::int from public.list_my_customers(search => '1111')), 1, 'search matches phone digits');

select is(
  (public.get_my_customer('ad300000-0000-0000-0000-000000000002') -> 'stats') ->> 'favorite_service',
  'Beard', 'the favourite service breaks ties by name'
);
select is(
  jsonb_array_length(public.get_my_customer('ad300000-0000-0000-0000-000000000002') -> 'history'),
  3, 'the history lists this barber''s appointments with the client'
);

select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', ' Likes a low fade ');
select is(public.get_my_customer('ad300000-0000-0000-0000-000000000002') ->> 'note', 'Likes a low fade', 'a private note is saved trimmed');
select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', '   ');
select is(public.get_my_customer('ad300000-0000-0000-0000-000000000002') -> 'note', 'null'::jsonb, 'a blank note clears it');
select throws_ok(
  $$ select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', repeat('x', 501)) $$,
  'P0028', null, 'a note over 500 characters is rejected'
);

select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$ select public.get_my_customer('ad300000-0000-0000-0000-000000000002') $$,
  'P0007', null, 'a barber cannot open another barber''s client'
);
select throws_ok(
  $$ select public.set_my_customer_note('ad300000-0000-0000-0000-000000000002', 'sneaky') $$,
  'P0007', null, 'a barber cannot write a note on another barber''s client'
);

select set_config('request.jwt.claim.sub', 'ad000000-0000-0000-0000-000000000004', true);
select throws_ok($$ select * from public.list_my_customers() $$, 'P0019', null, 'a customer cannot list clients');

select * from finish();
rollback;
```
(The "B cannot set a note" case is covered by the same `is_my_client` guard; add a 19th assertion if desired and bump the plan.)

- [ ] **Step 2: Run to fail** — `rtk npx supabase test db supabase/tests/022_barber_clients.sql` → FAIL (functions missing).

- [ ] **Step 3: Migration** — `supabase/migrations/0037_barber_clients.sql`

```sql
create table public.barber_customer_notes (
  barber_id uuid not null references public.barbers (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  note text not null,
  updated_at timestamptz not null default now(),
  primary key (barber_id, customer_id),
  constraint barber_customer_notes_length check (char_length(note) between 1 and 500)
);

-- Private to the author: no policies and no grants, so only the security-definer RPCs below can touch it.
revoke all on table public.barber_customer_notes from anon, authenticated;
alter table public.barber_customer_notes enable row level security;

create function public.is_my_client(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.barbers b
    join public.customers c on c.shop_id = b.shop_id and c.id = target_customer_id
    where b.user_id = auth.uid() and b.active
      and c.active and c.anonymized_at is null
      and (
        c.created_by_barber_id = b.id
        or exists (select 1 from public.appointments a where a.barber_id = b.id and a.customer_id = c.id)
      )
  );
$$;

create function public.list_my_customers(
  search text default null,
  only_lapsed boolean default false,
  lapsed_days integer default 45,
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  customer_id uuid,
  full_name text,
  phone text,
  email text,
  has_account boolean,
  visits integer,
  last_visit_at timestamptz,
  next_visit_at timestamptz,
  is_lapsed boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  needle text := lower(btrim(coalesce(search, '')));
  digits text := regexp_replace(coalesce(search, ''), '\D', '', 'g');
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if page_limit < 1 or page_limit > 100 or page_offset < 0 or lapsed_days < 1 then
    raise exception using errcode = 'P0014', message = 'AGENDA_INVALID_RANGE';
  end if;

  return query
  select
    s.id, s.full_name, s.phone, s.email, s.has_account, s.visits, s.last_visit_at, s.next_visit_at,
    (s.last_visit_at is not null and s.last_visit_at < now() - make_interval(days => lapsed_days) and s.next_visit_at is null)
  from (
    select
      c.id,
      c.full_name,
      c.phone,
      c.email,
      (c.user_id is not null) as has_account,
      (count(a.id) filter (where a.status = 'completed'))::int as visits,
      max(a.starts_at) filter (where a.status = 'completed') as last_visit_at,
      min(a.starts_at) filter (where a.status in ('scheduled', 'confirmed') and a.starts_at > now()) as next_visit_at
    from public.customers c
    left join public.appointments a on a.customer_id = c.id and a.barber_id = me.id
    where c.shop_id = me.shop_id
      and c.active
      and c.anonymized_at is null
      and (
        c.created_by_barber_id = me.id
        or exists (select 1 from public.appointments x where x.barber_id = me.id and x.customer_id = c.id)
      )
      and (
        needle = ''
        or position(needle in lower(c.full_name)) > 0
        or position(needle in lower(coalesce(c.email, ''))) > 0
        or (digits <> '' and position(digits in coalesce(c.phone, '')) > 0)
      )
    group by c.id
  ) s
  where not only_lapsed
    or (s.last_visit_at is not null and s.last_visit_at < now() - make_interval(days => lapsed_days) and s.next_visit_at is null)
  order by s.last_visit_at desc nulls last, s.full_name
  limit page_limit offset page_offset;
end;
$$;

create function public.get_my_customer(target_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  cust public.customers%rowtype;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if not public.is_my_client(target_customer_id) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;

  select * into cust from public.customers where id = target_customer_id;

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', cust.id, 'full_name', cust.full_name, 'phone', cust.phone, 'email', cust.email, 'has_account', cust.user_id is not null
    ),
    'stats', (
      select jsonb_build_object(
        'visits', count(*) filter (where a.status = 'completed'),
        'cancelled', count(*) filter (where a.status = 'cancelled'),
        'no_show', count(*) filter (where a.status = 'no_show'),
        'last_visit_at', max(a.starts_at) filter (where a.status = 'completed'),
        'next_visit_at', min(a.starts_at) filter (where a.status in ('scheduled', 'confirmed') and a.starts_at > now()),
        'favorite_service', (
          select f.service_name_snapshot
          from public.appointments f
          where f.barber_id = me.id and f.customer_id = cust.id and f.status = 'completed'
          group by f.service_name_snapshot
          order by count(*) desc, f.service_name_snapshot
          limit 1
        )
      )
      from public.appointments a
      where a.barber_id = me.id and a.customer_id = cust.id
    ),
    'note', (select n.note from public.barber_customer_notes n where n.barber_id = me.id and n.customer_id = cust.id),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.starts_at desc)
      from (
        select a.id, a.starts_at, a.service_name_snapshot as service_name, a.status
        from public.appointments a
        where a.barber_id = me.id and a.customer_id = cust.id
        order by a.starts_at desc
        limit 20
      ) h
    ), '[]'::jsonb)
  );
end;
$$;

create function public.set_my_customer_note(target_customer_id uuid, new_note text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  clean text := nullif(btrim(coalesce(new_note, '')), '');
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if not public.is_my_client(target_customer_id) then
    raise exception using errcode = 'P0007', message = 'CUSTOMER_UNAVAILABLE';
  end if;
  if clean is not null and char_length(clean) > 500 then
    raise exception using errcode = 'P0028', message = 'CUSTOMER_NOTE_INVALID';
  end if;

  if clean is null then
    delete from public.barber_customer_notes where barber_id = me.id and customer_id = target_customer_id;
  else
    insert into public.barber_customer_notes (barber_id, customer_id, note)
    values (me.id, target_customer_id, clean)
    on conflict (barber_id, customer_id) do update set note = excluded.note, updated_at = now();
  end if;
end;
$$;

revoke all on function public.is_my_client(uuid) from public, anon;
revoke all on function public.list_my_customers(text, boolean, integer, integer, integer) from public, anon;
revoke all on function public.get_my_customer(uuid) from public, anon;
revoke all on function public.set_my_customer_note(uuid, text) from public, anon;
grant execute on function public.is_my_client(uuid) to authenticated;
grant execute on function public.list_my_customers(text, boolean, integer, integer, integer) to authenticated;
grant execute on function public.get_my_customer(uuid) to authenticated;
grant execute on function public.set_my_customer_note(uuid, text) to authenticated;
```
Notes: the output parameters are named like columns, so every column reference in `list_my_customers` is qualified (`c.`, `s.`, `a.`); the subquery's `c.id` is aliased through `s.id`. In `get_my_customer`, `cust` (not `c`) avoids clashing with aliases.

- [ ] **Step 4: Apply and run** — `rtk npx supabase migration up && rtk npx supabase test db supabase/tests/022_barber_clients.sql supabase/tests/017_barber_booking.sql supabase/tests/018_barber_customer_rpcs.sql` → pass (if the planned count is off, fix `plan(n)`).
- [ ] **Step 5: Commit** — `feat(db): barber clients list, detail and private notes`.

---

### Task 2: Clients data layer

**Files:** Create `src/features/clients/format.ts`, `src/features/clients/api.ts`; modify `src/lib/errors/domain-errors.ts`, `src/i18n/locales/*.ts` (error code); tests `tests/unit/client-format.test.ts`, `tests/integration/barber-clients.test.ts`.

**Interfaces:**
```ts
export const LAPSED_DAYS = 45;
export function daysSince(iso: string, now: Date): number;
export function whatsappUrl(phone: string | null): string | null;
export function telUrl(phone: string | null): string | null;
export type MyClient = { customerId: string; email: string | null; fullName: string; hasAccount: boolean; isLapsed: boolean; lastVisitAt: string | null; nextVisitAt: string | null; phone: string | null; visits: number };
export type ClientDetail = {
  customer: { email: string | null; fullName: string; hasAccount: boolean; id: string; phone: string | null };
  history: Array<{ id: string; serviceName: string; startsAt: string; status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show" }>;
  note: string | null;
  stats: { cancelled: number; favoriteService: string | null; lastVisitAt: string | null; nextVisitAt: string | null; noShow: number; visits: number };
};
export function listMyClients(supabase, input?: { limit?: number; offset?: number; onlyLapsed?: boolean; search?: string }): Promise<MyClient[]>;
export function getMyClient(supabase, customerId: string): Promise<ClientDetail>;
export function setMyClientNote(supabase, customerId: string, note: string): Promise<void>;
```
`DomainErrorCode` gains `"CUSTOMER_NOTE_INVALID"` (`P0028`).

- [ ] **Step 1: Failing tests**

`tests/unit/client-format.test.ts`:
```ts
import { daysSince, LAPSED_DAYS, telUrl, whatsappUrl } from "../../src/features/clients/format";

describe("client contact links", () => {
  it("adds the Brazilian country code when it is missing", () => {
    expect(whatsappUrl("(11) 98888-7777")).toBe("https://wa.me/5511988887777");
    expect(whatsappUrl("1133334444")).toBe("https://wa.me/551133334444");
  });

  it("keeps a number that already has the country code", () => {
    expect(whatsappUrl("+55 11 98888-7777")).toBe("https://wa.me/5511988887777");
  });

  it("returns null when there is no usable number", () => {
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl("123")).toBeNull();
    expect(telUrl("")).toBeNull();
  });

  it("builds a tel link with the country code", () => {
    expect(telUrl("11 98888-7777")).toBe("tel:+5511988887777");
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince("2026-09-20T15:00:00.000Z", new Date("2026-10-01T10:00:00.000Z"))).toBe(10);
    expect(daysSince("2026-10-01T09:00:00.000Z", new Date("2026-10-01T10:00:00.000Z"))).toBe(0);
  });

  it("exposes the lapsed threshold", () => {
    expect(LAPSED_DAYS).toBe(45);
  });
});
```
`tests/integration/barber-clients.test.ts`:
```ts
import { getMyClient, listMyClients, setMyClientNote } from "../../src/features/clients/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("barber clients client", () => {
  it("lists clients with the search and filter parameters", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        customer_id: "c1", email: null, full_name: "Ana", has_account: false, is_lapsed: true,
        last_visit_at: "2026-08-01T15:00:00Z", next_visit_at: null, phone: "11988887777", visits: 3,
      }],
      error: null,
    });

    await expect(listMyClients({ rpc } as never, { onlyLapsed: true, search: " an " })).resolves.toEqual([
      { customerId: "c1", email: null, fullName: "Ana", hasAccount: false, isLapsed: true, lastVisitAt: "2026-08-01T15:00:00Z", nextVisitAt: null, phone: "11988887777", visits: 3 },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_my_customers", { lapsed_days: 45, only_lapsed: true, page_limit: 50, page_offset: 0, search: "an" });
  });

  it("maps the detail payload", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        customer: { email: "a@x.com", full_name: "Ana", has_account: true, id: "c1", phone: null },
        history: [{ id: "a1", service_name: "Cut", starts_at: "2026-09-01T15:00:00Z", status: "completed" }],
        note: "Low fade",
        stats: { cancelled: 1, favorite_service: "Cut", last_visit_at: "2026-09-01T15:00:00Z", next_visit_at: null, no_show: 0, visits: 4 },
      },
      error: null,
    });

    await expect(getMyClient({ rpc } as never, "c1")).resolves.toEqual({
      customer: { email: "a@x.com", fullName: "Ana", hasAccount: true, id: "c1", phone: null },
      history: [{ id: "a1", serviceName: "Cut", startsAt: "2026-09-01T15:00:00Z", status: "completed" }],
      note: "Low fade",
      stats: { cancelled: 1, favoriteService: "Cut", lastVisitAt: "2026-09-01T15:00:00Z", nextVisitAt: null, noShow: 0, visits: 4 },
    });
    expect(rpc).toHaveBeenCalledWith("get_my_customer", { target_customer_id: "c1" });
  });

  it("saves a note and rejects one over 500 characters before calling the database", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await setMyClientNote({ rpc } as never, "c1", "  Low fade ");
    expect(rpc).toHaveBeenCalledWith("set_my_customer_note", { new_note: "Low fade", target_customer_id: "c1" });
    await expect(setMyClientNote({ rpc } as never, "c1", "x".repeat(501))).rejects.toMatchObject({ code: "CUSTOMER_NOTE_INVALID" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps database errors", async () => {
    expect(toDomainError({ code: "P0028" }).code).toBe("CUSTOMER_NOTE_INVALID");
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0007" } });

    await expect(getMyClient({ rpc } as never, "c1")).rejects.toMatchObject({ code: "CUSTOMER_UNAVAILABLE" });
  });
});
```

- [ ] **Step 2: Run to fail** — `rtk npx jest tests/unit/client-format.test.ts tests/integration/barber-clients.test.ts --forceExit` → FAIL.
- [ ] **Step 3: Implement**

`format.ts`:
```ts
export const LAPSED_DAYS = 45;

export function daysSince(iso: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

// Brazilian numbers: a 10-11 digit local number gets the 55 prefix; 12-13 digits starting with 55 are kept as they are.
function internationalDigits(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");

  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) return digits;

  return null;
}

export function whatsappUrl(phone: string | null) {
  const digits = internationalDigits(phone);

  return digits ? `https://wa.me/${digits}` : null;
}

export function telUrl(phone: string | null) {
  const digits = internationalDigits(phone);

  return digits ? `tel:+${digits}` : null;
}
```
`api.ts`:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { LAPSED_DAYS } from "./format";

type Rpc = Pick<SupabaseClient, "rpc">;

export type MyClient = {
  customerId: string; email: string | null; fullName: string; hasAccount: boolean; isLapsed: boolean;
  lastVisitAt: string | null; nextVisitAt: string | null; phone: string | null; visits: number;
};

export type ClientDetail = {
  customer: { email: string | null; fullName: string; hasAccount: boolean; id: string; phone: string | null };
  history: Array<{ id: string; serviceName: string; startsAt: string; status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show" }>;
  note: string | null;
  stats: { cancelled: number; favoriteService: string | null; lastVisitAt: string | null; nextVisitAt: string | null; noShow: number; visits: number };
};

export const MAX_NOTE_LENGTH = 500;

function toError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.")
    : domainError;
}

export async function listMyClients(
  supabase: Rpc,
  input: { limit?: number; offset?: number; onlyLapsed?: boolean; search?: string } = {},
): Promise<MyClient[]> {
  const { data, error } = await supabase.rpc("list_my_customers", {
    lapsed_days: LAPSED_DAYS,
    only_lapsed: input.onlyLapsed ?? false,
    page_limit: input.limit ?? 50,
    page_offset: input.offset ?? 0,
    search: input.search?.trim() || null,
  });
  if (error) throw toError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as {
      customer_id: string; email: string | null; full_name: string; has_account: boolean; is_lapsed: boolean;
      last_visit_at: string | null; next_visit_at: string | null; phone: string | null; visits: number;
    };

    return {
      customerId: r.customer_id, email: r.email, fullName: r.full_name, hasAccount: r.has_account, isLapsed: r.is_lapsed,
      lastVisitAt: r.last_visit_at, nextVisitAt: r.next_visit_at, phone: r.phone, visits: r.visits,
    };
  });
}

export async function getMyClient(supabase: Rpc, customerId: string): Promise<ClientDetail> {
  const { data, error } = await supabase.rpc("get_my_customer", { target_customer_id: customerId });
  if (error) throw toError(error);

  const d = data as {
    customer: { email: string | null; full_name: string; has_account: boolean; id: string; phone: string | null };
    history: Array<{ id: string; service_name: string; starts_at: string; status: ClientDetail["history"][number]["status"] }>;
    note: string | null;
    stats: { cancelled: number; favorite_service: string | null; last_visit_at: string | null; next_visit_at: string | null; no_show: number; visits: number };
  };

  return {
    customer: { email: d.customer.email, fullName: d.customer.full_name, hasAccount: d.customer.has_account, id: d.customer.id, phone: d.customer.phone },
    history: d.history.map((h) => ({ id: h.id, serviceName: h.service_name, startsAt: h.starts_at, status: h.status })),
    note: d.note,
    stats: {
      cancelled: d.stats.cancelled, favoriteService: d.stats.favorite_service, lastVisitAt: d.stats.last_visit_at,
      nextVisitAt: d.stats.next_visit_at, noShow: d.stats.no_show, visits: d.stats.visits,
    },
  };
}

export async function setMyClientNote(supabase: Rpc, customerId: string, note: string) {
  const clean = note.trim();

  if (clean.length > MAX_NOTE_LENGTH) throw new DomainError("CUSTOMER_NOTE_INVALID", "The note is too long.");

  const { error } = await supabase.rpc("set_my_customer_note", { new_note: clean, target_customer_id: customerId });
  if (error) throw toError(error);
}
```
`domain-errors.ts`: add `| "CUSTOMER_NOTE_INVALID"` and `case "P0028": return new DomainError("CUSTOMER_NOTE_INVALID", "The note must have up to 500 characters.");`. i18n `errors.codes.CUSTOMER_NOTE_INVALID`: en "The note must have up to 500 characters." / pt "A nota deve ter até 500 caracteres." / es "La nota debe tener hasta 500 caracteres."
- [ ] **Step 4: Run** — `rtk npx jest tests/unit/client-format.test.ts tests/integration/barber-clients.test.ts tests/unit/locale-parity.test.ts --forceExit && rtk npm run typecheck && npx eslint src tests` → PASS.
- [ ] **Step 5: Commit** — `feat(barber): clients API, contact links and error code`.

---

### Task 3: The Clients tab

**Files:** Create `app/(barber)/clients/_layout.tsx`, `index.tsx`, `[id].tsx`; modify `app/(barber)/_layout.tsx`, `src/i18n/locales/*.ts`; test `tests/e2e/barber-clients.web.spec.ts`.

**Interfaces:** Consumes Task 2. Test IDs: `client-search`, `clients-filter-all`, `clients-filter-lapsed`, `client-row-<id>`, `client-lapsed-<id>`, `client-whatsapp`, `client-call`, `client-note`, `client-note-save`, `client-stat-visits`, `client-history`.

- [ ] **Step 1: Strings** (en / pt / es), group `barber.clients`:
`title` Clients / Clientes / Clientes · `searchLabel` Search clients / Buscar clientes / Buscar clientes · `filterAll` All / Todos / Todos · `filterLapsed` Lapsed / Sumidos / Ausentes · `lapsedBadge` Lapsed / Sumido / Ausente · `noAccount` No account / Sem conta / Sin cuenta · `lastVisit` Last visit {{date}} / Última visita {{date}} / Última visita {{date}} · `neverVisited` No visits yet / Ainda sem visitas / Aún sin visitas · `visitsLine` Visits: {{count}} / Visitas: {{count}} / Visitas: {{count}} · `empty` No clients yet. People you book or serve show up here. / Ainda sem clientes. Quem você agenda ou atende aparece aqui. / Aún no hay clientes. Quien agendas o atiendes aparece aquí. · `emptyLapsed` No lapsed clients. / Nenhum cliente sumido. / Ningún cliente ausente. · `emptySearch` No client matches your search. / Nenhum cliente encontrado. / Ningún cliente coincide. · `loadError` Unable to load your clients. / Não foi possível carregar seus clientes. / No se pudieron cargar tus clientes. · `whatsapp` WhatsApp / WhatsApp / WhatsApp · `call` Call / Ligar / Llamar · `noPhone` No phone number / Sem telefone / Sin teléfono · `statVisits` Visits / Visitas / Visitas · `statCancelled` Cancelled / Cancelamentos / Cancelaciones · `statNoShow` Missed / Faltas / Ausencias · `statFavorite` Favourite service / Serviço favorito / Servicio favorito · `statLast` Last visit / Última visita / Última visita · `statNext` Next appointment / Próximo agendamento / Próxima cita · `none` None / Nenhum / Ninguno · `history` Recent history / Histórico recente / Historial reciente · `historyEmpty` No appointments yet. / Ainda sem atendimentos. / Aún sin citas. · `noteTitle` Private note / Nota privada / Nota privada · `noteHint` Only you can see this. / Só você vê isto. / Solo tú ves esto. · `notePlaceholder` Preferences, allergies, how they like the cut… / Preferências, alergias, como gosta do corte… / Preferencias, alergias, cómo le gusta el corte… · `noteSave` Save note / Salvar nota / Guardar nota · `noteSaved` Note saved. / Nota salva. / Nota guardada. · `noteError` Unable to save the note. / Não foi possível salvar a nota. / No se pudo guardar la nota. · `detailError` Unable to load this client. / Não foi possível carregar este cliente. / No se pudo cargar este cliente. `tabs.clients`: Clients / Clientes / Clientes.

- [ ] **Step 2: Failing e2e** — `tests/e2e/barber-clients.web.spec.ts` (copy `signIn`, `barberProfile`, `mockBarberRest` from `tests/e2e/barber-reports.web.spec.ts`):
```ts
const clientRows = [
  { customer_id: "c1", email: null, full_name: "Ana Souza", has_account: false, is_lapsed: false, last_visit_at: "2026-09-28T15:00:00Z", next_visit_at: null, phone: "11988887777", visits: 5 },
  { customer_id: "c2", email: "bia@x.com", full_name: "Bia Lima", has_account: true, is_lapsed: true, last_visit_at: "2026-07-01T15:00:00Z", next_visit_at: null, phone: null, visits: 2 },
];

test("the clients tab lists clients, filters lapsed ones and searches", async ({ page }) => {
  const calls: Array<Record<string, unknown>> = [];

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(body);
      return json(route, body.only_lapsed ? clientRows.filter((r) => r.is_lapsed) : clientRows).then(() => true);
    }
  });

  await page.goto("/clients");
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByTestId("client-row-c1")).toContainText("Ana Souza");
  await expect(page.getByTestId("client-lapsed-c1")).toHaveCount(0);
  await expect(page.getByTestId("client-lapsed-c2")).toBeVisible();

  await page.getByTestId("clients-filter-lapsed").click();
  await expect(page.getByTestId("client-row-c1")).toHaveCount(0);
  await expect(page.getByTestId("client-row-c2")).toBeVisible();

  await page.getByTestId("clients-filter-all").click();
  await page.getByTestId("client-search").fill("ana");
  await expect.poll(() => calls.some((c) => c.search === "ana")).toBe(true);
});

test("a client detail shows stats, history, contact links and saves a private note", async ({ page }) => {
  let notePayload: Record<string, unknown> | null = null;

  await signIn(page, barberUserId);
  await mockBarberRest(page, async (route, url) => {
    if (url.pathname.endsWith("/rpc/list_my_customers")) return json(route, clientRows).then(() => true);
    if (url.pathname.endsWith("/rpc/get_my_customer")) {
      return json(route, {
        customer: { email: null, full_name: "Ana Souza", has_account: false, id: "c1", phone: "11988887777" },
        history: [{ id: "a1", service_name: "Browser Cut", starts_at: "2026-09-28T15:00:00Z", status: "completed" }],
        note: null,
        stats: { cancelled: 1, favorite_service: "Browser Cut", last_visit_at: "2026-09-28T15:00:00Z", next_visit_at: null, no_show: 0, visits: 5 },
      }).then(() => true);
    }
    if (url.pathname.endsWith("/rpc/set_my_customer_note")) {
      notePayload = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, null).then(() => true);
    }
  });

  await page.goto("/clients/c1");
  await expect(page.getByRole("heading", { name: "Ana Souza" })).toBeVisible();
  await expect(page.getByTestId("client-stat-visits")).toContainText("5");
  await expect(page.getByTestId("client-history")).toContainText("Browser Cut");
  await expect(page.getByTestId("client-whatsapp")).toHaveAttribute("href", "https://wa.me/5511988887777");

  await page.getByTestId("client-note").fill("Low fade, no clippers on the neck");
  await page.getByTestId("client-note-save").click();
  await expect(page.getByText("Note saved.")).toBeVisible();
  expect(notePayload).toEqual({ new_note: "Low fade, no clippers on the neck", target_customer_id: "c1" });
});
```
(`client-whatsapp` is a `Pressable` with `accessibilityRole="link"` and `href` so the web renders an anchor; on native it calls `Linking.openURL`. If the `href` prop is not forwarded by the `Pressable`, use `<Text role="link" href=…>` / `Linking` and assert the URL via a `page.waitForEvent("popup")` instead.) Run (own Metro on 4173, no `.env.local`): the specs FAIL.

- [ ] **Step 3: Implement**

`app/(barber)/_layout.tsx`: add `Users` to the `lucide-react-native` import; items become `[agenda, clients, earnings, my-profile]` with `{ icon: Users, key: "clients", label: t("tabs.clients") }` second; add `<Tabs.Screen name="clients" />` after `my-agenda`.

`clients/_layout.tsx`: `<Stack screenOptions={{ headerShown: false }} />` (same as `my-profile/_layout.tsx`).

`clients/index.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { listMyClients } from "../../../src/features/clients/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateLabel } from "../../../src/lib/i18n/format";

export default function ClientsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [onlyLapsed, setOnlyLapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);

    return () => clearTimeout(timer);
  }, [search]);

  const clients = useQuery({
    queryFn: () => listMyClients(supabase, { onlyLapsed, search: debounced }),
    queryKey: ["my-clients", onlyLapsed, debounced],
  });

  const emptyTitle = debounced ? t("barber.clients.emptySearch") : onlyLapsed ? t("barber.clients.emptyLapsed") : t("barber.clients.empty");

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("barber.clients.title")}</Text>
          <View className="w-full max-w-[420px] gap-3">
            <Input label={t("barber.clients.searchLabel")} onChangeText={setSearch} testID="client-search" value={search} />
            <View className="flex-row gap-2">
              <Button label={t("barber.clients.filterAll")} onPress={() => setOnlyLapsed(false)} size="sm" testID="clients-filter-all" variant={onlyLapsed ? "outline" : "dark"} />
              <Button label={t("barber.clients.filterLapsed")} onPress={() => setOnlyLapsed(true)} size="sm" testID="clients-filter-lapsed" variant={onlyLapsed ? "dark" : "outline"} />
            </View>
            {clients.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
            {clients.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(clients.error, t, t("barber.clients.loadError"))}</Text> : null}
            {clients.data?.length === 0 ? <EmptyState title={emptyTitle} /> : null}
            {(clients.data ?? []).map((client) => (
              <Pressable accessibilityRole="button" key={client.customerId} onPress={() => router.push(`/clients/${client.customerId}`)} testID={`client-row-${client.customerId}`}>
                <Card variant="outlined">
                  <View className="flex-row items-center gap-3">
                    <Avatar name={client.fullName} size={44} />
                    <View className="flex-1 gap-0.5">
                      <Text className="text-base font-sans-semibold text-ink">{client.fullName}</Text>
                      <Text className="text-sm font-sans text-neutral-600">
                        {client.lastVisitAt
                          ? t("barber.clients.lastVisit", { date: formatDateLabel(formatInstantInShopTime(new Date(client.lastVisitAt)).localDate, language) })
                          : t("barber.clients.neverVisited")}
                      </Text>
                      <Text className="text-xs font-sans text-neutral-500">
                        {t("barber.clients.visitsLine", { count: client.visits })}
                        {client.hasAccount ? "" : ` · ${t("barber.clients.noAccount")}`}
                      </Text>
                    </View>
                    {client.isLapsed ? (
                      <View className="rounded-full bg-warning-400/20 px-2 py-1" testID={`client-lapsed-${client.customerId}`}>
                        <Text className="text-xs font-sans-semibold text-neutral-700">{t("barber.clients.lapsedBadge")}</Text>
                      </View>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```
(add `import { useSupabaseSession } from "../../../src/providers/AppProviders";`; `colors.warning` has no alpha utility — use `style={{ backgroundColor: colors.primary[100] }}` instead of `bg-warning-400/20` if the class is not generated.)

`clients/[id].tsx`: `useLocalSearchParams<{ id: string }>()`; query `["my-client", id]` → `getMyClient`; `ScreenHeader` (back via `useBack`, title `client.customer.fullName` rendered as the page heading), `Avatar` centered, contact row of two `Button`s (WhatsApp, Call) each opening `Linking.openURL(url)` (disabled with hint `noPhone` when `whatsappUrl(phone)` is null; on web render `<Pressable accessibilityRole="link" {...({ href: url } as object)} …>`), stat tiles (`StatTile`: visits, cancelled, missed; then last visit, next appointment, favourite service as small rows), `Card` with the history (`testID="client-history"`; each row: date label, `serviceName`, `StatusBadge status`), and the note editor: `Input multiline` (`testID="client-note"`, `maxLength` not enforced — validate with `MAX_NOTE_LENGTH`), hint, `Button testID="client-note-save"` calling `setMyClientNote`, success `Toast` `barber.clients.noteSaved`, error `errorMessage(...)` with fallback `noteError`; note state seeded from `client.data.note` in an effect; `onSuccess` invalidates `["my-client", id]`.

- [ ] **Step 4: Verify** — typecheck, eslint, `jest --runInBand --forceExit` (locale parity, no-hardcoded-text, route-collisions), and the new Playwright specs → PASS.
- [ ] **Step 5: Commit** — `feat(barber): clients tab with list, lapsed filter, detail and private note`.

---

### Task 4: Day summary on the agenda

**Files:** Create `src/features/appointments/day-summary.ts`, `src/components/domain/DaySummaryCard.tsx`; modify `app/(barber)/my-agenda.tsx`, `src/i18n/locales/*.ts`; tests `tests/unit/day-summary.test.ts`, `tests/unit/day-summary-card.test.ts`, e2e in `tests/e2e/barber-booking.web.spec.ts`.

**Interfaces:**
```ts
export type DaySummary = { completed: number; freeSlots: number; next: BarberAgendaAppointment | null; total: number };
export function buildDaySummary(appointments: BarberAgendaAppointment[], slots: AvailableSlot[], now: Date): DaySummary;
DaySummaryCard props: { earnedCents: number | null; summary: DaySummary; testID?: string }
```
`total` = non-cancelled appointments; `completed` = status completed; `next` = earliest scheduled/confirmed appointment whose `endsAt` is after `now`; `freeSlots` = number of free entries of `buildDayTimeline(appointments, slots, now)`.

- [ ] **Step 1: Strings** `barber.summary`: `title` Day summary / Resumo do dia / Resumen del día · `appointments` Appointments / Atendimentos / Citas · `done` {{count}} done / {{count}} concluídos / {{count}} completadas · `next` Next / Próximo / Siguiente · `nextNone` Nothing left / Nada mais / Nada más · `free` Free times / Horários livres / Horarios libres · `earned` Earned so far / Ganho até agora / Ganado hasta ahora.
- [ ] **Step 2: Failing tests**

`tests/unit/day-summary.test.ts`:
```ts
import { buildDaySummary } from "../../src/features/appointments/day-summary";

const NOW = new Date("2026-10-02T15:00:00.000Z");
const appt = (id: string, startsAt: string, endsAt: string, status: string) =>
  ({ endsAt, id, occupiedUntil: endsAt, startsAt, status }) as never;
const slot = (startsAt: string) => ({ endsAt: startsAt, localDate: "2026-10-02", localTime: "12:00", startsAt });

describe("buildDaySummary", () => {
  const appointments = [
    appt("done", "2026-10-02T12:00:00.000Z", "2026-10-02T12:30:00.000Z", "completed"),
    appt("gone", "2026-10-02T13:00:00.000Z", "2026-10-02T13:30:00.000Z", "cancelled"),
    appt("soon", "2026-10-02T16:00:00.000Z", "2026-10-02T16:30:00.000Z", "scheduled"),
    appt("later", "2026-10-02T18:00:00.000Z", "2026-10-02T18:30:00.000Z", "confirmed"),
  ];

  it("counts non-cancelled appointments and the completed ones", () => {
    expect(buildDaySummary(appointments, [], NOW)).toMatchObject({ completed: 1, total: 3 });
  });

  it("picks the earliest scheduled or confirmed appointment that has not ended", () => {
    expect(buildDaySummary(appointments, [], NOW).next?.id).toBe("soon");
    expect(buildDaySummary([appointments[0]], [], NOW).next).toBeNull();
  });

  it("counts only future free slots that are not inside an appointment", () => {
    const slots = [slot("2026-10-02T14:00:00.000Z"), slot("2026-10-02T16:15:00.000Z"), slot("2026-10-02T17:00:00.000Z"), slot("2026-10-02T19:00:00.000Z")];

    expect(buildDaySummary(appointments, slots, NOW).freeSlots).toBe(2);
  });
});
```
`tests/unit/day-summary-card.test.ts`:
```ts
import React from "react";
import { render } from "@testing-library/react-native";

import { DaySummaryCard } from "../../src/components/domain/DaySummaryCard";

const next = { customerName: "Ana", startsAt: "2026-10-02T17:30:00.000Z" } as never;

describe("DaySummaryCard", () => {
  it("shows the counts, the next client and the earnings", async () => {
    const view = await render(React.createElement(DaySummaryCard, { earnedCents: 4800, summary: { completed: 2, freeSlots: 7, next, total: 5 }, testID: "summary" }));

    expect(view.getByText("5")).toBeTruthy();
    expect(view.getByText("7")).toBeTruthy();
    expect(view.getByText(/Ana/)).toBeTruthy();
    expect(view.getByText("R$ 48,00")).toBeTruthy();
  });

  it("hides earnings for future days and shows a placeholder when nothing is left", async () => {
    const view = await render(React.createElement(DaySummaryCard, { earnedCents: null, summary: { completed: 0, freeSlots: 0, next: null, total: 0 } }));

    expect(view.queryByText(/R\$/)).toBeNull();
    expect(view.getByText("Nothing left")).toBeTruthy();
  });
});
```
- [ ] **Step 3: Run to fail**, then implement:

`day-summary.ts`:
```ts
import type { AvailableSlot } from "../availability/types";
import type { BarberAgendaAppointment } from "./barber-agenda";
import { buildDayTimeline } from "./day-slots";

export type DaySummary = { completed: number; freeSlots: number; next: BarberAgendaAppointment | null; total: number };

export function buildDaySummary(appointments: BarberAgendaAppointment[], slots: AvailableSlot[], now: Date): DaySummary {
  const live = appointments.filter((a) => a.status !== "cancelled");
  const upcoming = live
    .filter((a) => (a.status === "scheduled" || a.status === "confirmed") && new Date(a.endsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return {
    completed: live.filter((a) => a.status === "completed").length,
    freeSlots: buildDayTimeline(appointments, slots, now).filter((entry) => entry.kind === "free").length,
    next: upcoming[0] ?? null,
    total: live.length,
  };
}
```
`DaySummaryCard.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import type { DaySummary } from "../../features/appointments/day-summary";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { Card } from "../ui/Card";
import { formatPriceBRL } from "./ServiceCard";

export type DaySummaryCardProps = { earnedCents: number | null; summary: DaySummary; testID?: string };

function Cell({ label, sublabel, value }: { label: string; sublabel?: string; value: string }) {
  return (
    <View className="min-w-[120px] flex-1 gap-0.5">
      <Text className="text-xs font-sans-medium text-neutral-600">{label}</Text>
      <Text className="text-xl font-display-bold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{value}</Text>
      {sublabel ? <Text className="text-xs font-sans text-neutral-500">{sublabel}</Text> : null}
    </View>
  );
}

export function DaySummaryCard({ earnedCents, summary, testID }: DaySummaryCardProps) {
  const { t } = useTranslation();
  const nextTime = summary.next ? formatInstantInShopTime(new Date(summary.next.startsAt)).localTime : null;

  return (
    <Card testID={testID}>
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("barber.summary.title")}</Text>
        <View className="flex-row flex-wrap gap-3">
          <Cell label={t("barber.summary.appointments")} sublabel={t("barber.summary.done", { count: summary.completed })} value={String(summary.total)} />
          <Cell label={t("barber.summary.free")} value={String(summary.freeSlots)} />
          <Cell
            label={t("barber.summary.next")}
            sublabel={summary.next ? summary.next.customerName : undefined}
            value={nextTime ?? t("barber.summary.nextNone")}
          />
          {earnedCents !== null ? <Cell label={t("barber.summary.earned")} value={formatPriceBRL(earnedCents)} /> : null}
        </View>
      </View>
    </Card>
  );
}
```
(The first unit test asserts `getByText(/Ana/)` — satisfied by the `sublabel`.) Export from `src/components/domain/index.ts`.

- [ ] **Step 4: Wire into `my-agenda.tsx`.** Add imports (`DaySummaryCard`, `buildDaySummary`, `getMyBarberReport` from `../../src/features/reports/api`); under the existing queries add
```tsx
  const earnedQuery = useQuery({
    enabled: selectedDate <= today,
    queryFn: () => getMyBarberReport(supabase, selectedDate, selectedDate),
    queryKey: ["barber-report", selectedDate, selectedDate],
  });
  const summary = useMemo(() => buildDaySummary(dayAppointments, slots.data ?? [], new Date()), [dayAppointments, slots.data]);
  const earnedCents = selectedDate <= today ? (earnedQuery.data?.days[0]?.earningsCents ?? 0) : null;
```
and render `<View className="w-full max-w-[420px]"><DaySummaryCard earnedCents={earnedCents} summary={summary} testID="barber-day-summary" /></View>` right after the `CalendarStrip` block. Invalidate `["barber-report"]` where bookings/status changes already invalidate `["barber-agenda"]` (so the earned figure refreshes).
- [ ] **Step 5: E2E** — in `tests/e2e/barber-booking.web.spec.ts` add a test: with the default mock (agenda row starting "now", the free-slot mock) assert `page.getByTestId("barber-day-summary")` is visible and contains "Day summary" and `page.getByTestId("barber-day-summary")` contains "R$ 0,00" (today ⇒ earned shown; add a `get_my_barber_report` handler returning `{ days: [], services: [] }`).
- [ ] **Step 6: Verify** — typecheck, eslint, jest, e2e (4173, no `.env.local`) → PASS. **Commit** — `feat(barber): day summary card on the agenda`.

---

### Task 5: Verification, review and PR

- [ ] **Step 1:** typecheck, eslint, `jest --runInBand --forceExit`, `rtk npm run test:db` (known local-only `010_full_rls` failures), e2e runner (known 4 date failures; move `.env.local` aside).
- [ ] **Step 2: Real browser** (copy `.env.local`, `npx expo start --web --port 8083`, log in as `barber@teste.com`): insert throwaway clients and appointments for `Barber Teste` (names prefixed `Rep Cli`, notes `cli-test`, customers created with `created_by_barber_id`), check the Clients tab (list order, lapsed badge, filter, search, WhatsApp link, detail stats/history, note save persisted in the DB), and the agenda summary card for today and a future day (no earnings tile); screenshots + computed CSS. Clean up all throwaway rows (appointments, customers, notes), stop servers by PID, remove `.env.local`.
- [ ] **Step 3:** self-review the diff (notes table unreachable directly; every RPC checks the caller's barber row; `is_my_client` scope).
- [ ] **Step 4:** push `feat-barber-clients`, open the PR via REST with base `feat-barber-reports`, body in Portuguese, ending with the 🤖 line.
- [ ] **Step 5:** update `project_barber_booking.md` memory (PR number, migration 0037, what remains).

---

## Self-Review

**Spec coverage:** notes table, `is_my_client`, list/detail/note RPCs and pgTAP → T1; API, WhatsApp/tel, lapsed constant, error code → T2; tab, list, filter, search, detail, note, contact links → T3; summary logic, card, agenda wiring with earnings only for today/past → T4; verification and PR → T5. Out-of-scope items are untouched.

**Placeholder scan:** the detail screen `[id].tsx` is specified element by element with test IDs and the exact calls rather than full JSX, because it composes components already shown (`ScreenHeader`, `Avatar`, `StatTile`, `Card`, `Input`, `Button`, `Toast`, `StatusBadge`) in the same style as the list screen; all new logic is in full.

**Type consistency:** `MyClient`/`ClientDetail` fields match the mappers, the RPC column names (`customer_id`, `is_lapsed`, `last_visit_at`, `favorite_service`, `no_show`) and the e2e mocks; RPC argument names (`search`, `only_lapsed`, `lapsed_days`, `page_limit`, `page_offset`, `target_customer_id`, `new_note`) match SQL, API and tests; `DaySummary` fields match the card and the agenda wiring.
