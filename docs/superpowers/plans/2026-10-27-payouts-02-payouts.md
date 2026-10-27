# Repasses ao barbeiro — plano de implementação (PR2 de 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono configura a agenda de repasse de cada barbeiro de comissão (semanal, quinzenal, mensal ou sem agenda), registra pagamentos (inclusive avulsos) e vê o saldo e a situação; o barbeiro vê o que tem a receber, o histórico e a próxima data.

**Architecture:** Colunas de agenda em `barbers`, tabela `barber_payouts`, funções SQL puras de datas de vencimento e de saldo, RPCs `security definer` do dono e do barbeiro. No app, módulo `src/features/payouts/` (tipos, API, regras puras), tela `app/(owner)/payouts.tsx`, `ScheduleEditor` dentro do `CompensationEditor` e uma seção na tela de remuneração do barbeiro.

**Tech Stack:** Postgres/Supabase (pgTAP), TypeScript, Expo Router, React Native + NativeWind, TanStack Query, i18next (pt/es/en), Jest, Playwright (REST mockado).

**Spec:** `docs/superpowers/specs/2026-10-27-barber-payouts-design.md` (seção "PR2"). Depende do PR1 (`commission_percent_at`).

## Global Constraints

- Migração: `supabase/migrations/0061_barber_payouts.sql`. Códigos de erro novos: `P0039 PAYOUT_SCHEDULE_INVALID` e `P0040 PAYOUT_INVALID` (os códigos `P0031`–`P0038` já são de recorrência). Permissão do dono: `P0029 REPORT_FORBIDDEN`. Barbeiro sem vínculo: `P0019 BARBER_NOT_LINKED`.
- Dia da semana: 0 = domingo … 6 = sábado (`extract(dow)`).
- Quinzenal: dois dias do mês, `day_1 < day_2`. Dia inexistente no mês vira o último dia (`least(dia, último_dia_do_mês)`).
- Saldo = comissão dos atendimentos `completed` com `starts_at >= tracking_start` (meia-noite no fuso da barbearia) − repasses com `paid_on >= tracking_start`. Saldo negativo é "pago a mais", nunca erro.
- O barbeiro nunca recebe faturamento bruto; só o saldo, agenda, próxima data, contagem de atendimentos sem baixa e os próprios repasses.
- Tabela nova com RLS ligada e `revoke all ... from public, anon, authenticated`; funções auxiliares internas com `revoke all ... from public, anon, authenticated`; RPCs expostas com `revoke ... from public, anon` e `grant execute ... to authenticated`.
- Textos em pt, es e en com as mesmas chaves. `className` só em elementos RN simples. Sem `Alert.alert`.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Comandos de saída longa levam `rtk`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0061_barber_payouts.sql` | colunas, constraints, tabela, helpers, RPCs, redefinição de `set_barber_compensation` |
| `supabase/tests/043_barber_payouts.sql` | pgTAP de datas, saldo, status, permissões, constraints |
| `src/features/payouts/types.ts` | tipos de domínio |
| `src/features/payouts/api.ts` | chamadas RPC e mapeamento de linhas |
| `src/features/payouts/schedule.ts` | validação e descrição da agenda (puro) |
| `src/features/payouts/balance.ts` | etiqueta/tom da situação (puro) |
| `src/features/payouts/format.ts` | `formatDayMonth`, `todayInZone`-free helpers de data (puro) |
| `src/features/payouts/owner/ScheduleEditor.tsx` | seletor de agenda |
| `src/features/payouts/owner/PayoutCard.tsx`, `PayoutForm.tsx`, `PayoutHistory.tsx` | cartão, formulário, histórico |
| `src/features/payouts/barber/MyPayoutSection.tsx` | visão do barbeiro |
| `app/(owner)/payouts.tsx` | tela "Repasses" |
| `app/(owner)/_layout.tsx`, `app/(owner)/manage.tsx` | rota e entrada no hub |
| `app/(barber)/my-profile/compensation.tsx` | inclui `MyPayoutSection` |
| `src/lib/errors/domain-errors.ts`, `src/i18n/locales/*.ts` | códigos e textos |
| `tests/unit/payout-schedule.test.ts`, `tests/unit/payout-balance.test.ts`, `tests/integration/payouts.test.ts`, `tests/e2e/owner-payouts.web.spec.ts`, `tests/e2e/barber-payouts.web.spec.ts` | testes |

---

### Task 1: Testes SQL (falham primeiro)

**Files:**
- Create: `supabase/tests/043_barber_payouts.sql`

**Interfaces:**
- Consumes (criadas na Task 2): `payout_due_dates(payout_schedule, smallint, smallint, date, date) returns setof date`; `set_barber_payout_schedule(uuid, payout_schedule, smallint, smallint, date)`; `record_barber_payout(uuid, integer, date, text)`; `list_barber_payouts(date, date)`; `delete_barber_payout(uuid)`; `get_payout_overview()`; `get_my_payout_summary()`.

- [ ] **Step 1: Escrever o teste**

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- Pure date rules (run as the table owner, before switching roles).
select is(
  array(select d from public.payout_due_dates('weekly', 1::smallint, null, '2026-10-26', '2026-11-08') d),
  array['2026-10-26'::date, '2026-11-02'],
  'weekly on Mondays'
);
select is(
  array(select d from public.payout_due_dates('monthly', 31::smallint, null, '2027-02-01', '2027-02-28') d),
  array['2027-02-28'::date],
  'monthly day 31 falls on the last day of a short month'
);
select is(
  array(select d from public.payout_due_dates('monthly', 31::smallint, null, '2028-02-01', '2028-02-29') d),
  array['2028-02-29'::date],
  'and on the 29th in a leap February'
);
select is(
  array(select d from public.payout_due_dates('biweekly', 15::smallint, 31::smallint, '2026-04-01', '2026-04-30') d),
  array['2026-04-15'::date, '2026-04-30'],
  'biweekly 15 and 31 in a 30-day month'
);
select is(
  (select count(*)::int from public.payout_due_dates('biweekly', 29::smallint, 31::smallint, '2027-02-01', '2027-02-28')),
  1, 'two days that both clamp to the same date collapse into one'
);
select is(
  (select count(*)::int from public.payout_due_dates('none', null, null, '2026-01-01', '2026-12-31')),
  0, 'no schedule means no due dates'
);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't43-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't43-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'b0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'b0000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b0100000-0000-0000-0000-000000000001', 'T43 Shop', 'b0000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- A: commission 50, tracking since 20 days ago. C: commission 40 without a schedule. R: chair rental.
insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, chair_rental_amount_cents, chair_rental_frequency, payout_tracking_start)
values
  ('b0200000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 50, null, null, current_date - 20),
  ('b0200000-0000-0000-0000-000000000002', 'b0100000-0000-0000-0000-000000000001', null, 'Barber C', 'commission', 40, null, null, current_date - 20),
  ('b0200000-0000-0000-0000-000000000003', 'b0100000-0000-0000-0000-000000000001', null, 'Barber R', 'chair_rental', 0, 30000, 'monthly', null);

insert into public.customers (id, shop_id, full_name, email)
values ('b0300000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'T43 Customer', 't43-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b0400000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b0500000-0000-0000-0000-000000000001', 'b0100000-0000-0000-0000-000000000001', 'b0200000-0000-0000-0000-000000000001', 'b0400000-0000-0000-0000-000000000001');

create function pg_temp.appt(back integer, appt_status public.appointment_status)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'b0100000-0000-0000-0000-000000000001', 'b0200000-0000-0000-0000-000000000001', 'b0300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    appt_status, 'Cut', 30, 10000, 0
  from public.barber_services bs where bs.barber_id = 'b0200000-0000-0000-0000-000000000001'
$$;

-- A earned 2 x 100,00 x 50% = 10000 from completed work; a past appointment nobody closed does not count.
select pg_temp.appt(10, 'completed');
select pg_temp.appt(2, 'completed');
select pg_temp.appt(5, 'confirmed');
select pg_temp.appt(-3, 'scheduled');

-- Weekly schedule whose last due date was exactly 3 days ago.
update public.barbers set payout_schedule = 'weekly', payout_day_1 = extract(dow from current_date - 3)::smallint
where id = 'b0200000-0000-0000-0000-000000000001';

create function pg_temp.row_a() returns public.barbers language sql as $$
  select * from public.barbers where id = 'b0200000-0000-0000-0000-000000000001'
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);

select is((select balance_cents from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 10000, 'balance counts only completed appointments');
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'pending', 'a passed due date with no payout since is pending');
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000002'), 'no_schedule', 'a barber without a schedule has no status pressure');
select is((select count(*)::int from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000003'), 0, 'chair-rental barbers are not part of payouts');

select is(
  (select amount_cents from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 3000, current_date - 1, 'first part')),
  3000, 'the owner records a partial payout'
);
select is((select balance_cents from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 7000, 'the balance drops by what was paid');
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'ok', 'a payout after the last due date clears the pending flag');

select is(
  (select amount_cents from public.record_barber_payout('b0200000-0000-0000-0000-000000000002', 1500, current_date, null)),
  1500, 'a one-off payout works for a barber without a schedule'
);
select throws_ok($$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000003', 1000, current_date) $$, 'P0040', null, 'a chair-rental barber has no payout');
select throws_ok($$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 0, current_date) $$, 'P0040', null, 'the amount must be positive');
select is(
  (select count(*)::int from public.list_barber_payouts(current_date - 30, current_date + 1)),
  2, 'both payouts are listed with the barber names'
);

-- Today becomes the due date: nothing paid since today yet.
reset role;
update public.barbers set payout_day_1 = extract(dow from current_date)::smallint where id = 'b0200000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', true);
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'due_today', 'due today while there is a balance and no payout dated today');

select lives_ok(
  $$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 9000, current_date) $$,
  'paying more than the balance is allowed'
);
select is((select balance_cents from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), -2000, 'the surplus shows as a negative balance');

select throws_ok(
  $$ select public.set_barber_payout_schedule('b0200000-0000-0000-0000-000000000001', 'biweekly', 20::smallint, 5::smallint, null) $$,
  'P0039', null, 'biweekly days must be ascending'
);
select throws_ok(
  $$ select public.set_barber_payout_schedule('b0200000-0000-0000-0000-000000000001', 'weekly', 7::smallint, null, null) $$,
  'P0039', null, 'the weekday is 0 to 6'
);
select throws_ok(
  $$ select public.set_barber_payout_schedule('b0200000-0000-0000-0000-000000000003', 'monthly', 5::smallint, null, null) $$,
  'P0039', null, 'a chair-rental barber cannot get a payout schedule'
);

select lives_ok(
  $$ select public.delete_barber_payout((select id from public.list_barber_payouts(current_date - 30, current_date + 1) where amount_cents = 9000)) $$,
  'the owner removes a mistaken payout'
);

-- The barber's own view: balance and payouts, no gross revenue.
select set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000002', true);
select is(
  (select (public.get_my_payout_summary() ->> 'balance_cents')::int),
  7000, 'the barber sees what is left to receive'
);
select is(
  (select (public.get_my_payout_summary() ->> 'past_unmarked_count')::int),
  1, 'and how many past appointments still lack a close-out'
);
select throws_ok($$ select * from public.record_barber_payout('b0200000-0000-0000-0000-000000000001', 1000, current_date) $$, 'P0029', null, 'a barber cannot record payouts');

select * from finish();
rollback;
```

A contagem é 27: 6 de datas e 21 depois do `set local role`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npx supabase test db`
Expected: FAIL em `043_barber_payouts.sql` (tipos/funções inexistentes).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/043_barber_payouts.sql
git commit -m "test: barber payouts (failing)"
```

---

### Task 2: Migração 0061

**Files:**
- Create: `supabase/migrations/0061_barber_payouts.sql`

**Interfaces:**
- Produces: tipo `payout_schedule`; colunas `barbers.payout_schedule/payout_day_1/payout_day_2/payout_tracking_start`; tabela `barber_payouts`; `payout_due_dates`; `payout_earned_cents(uuid, date, text)`; `payout_paid_cents(uuid, date)`; RPCs `set_barber_payout_schedule`, `record_barber_payout`, `list_barber_payouts`, `delete_barber_payout`, `get_payout_overview`, `get_my_payout_summary`; `set_barber_compensation` redefinida.

- [ ] **Step 1: Colunas, constraints e preenchimento do passado**

```sql
create type public.payout_schedule as enum ('none', 'weekly', 'biweekly', 'monthly');

alter table public.barbers
  add column payout_schedule public.payout_schedule not null default 'none',
  add column payout_day_1 smallint,
  add column payout_day_2 smallint,
  add column payout_tracking_start date;

alter table public.barbers add constraint barbers_payout_schedule_matches check (
  (payout_schedule = 'none' and payout_day_1 is null and payout_day_2 is null)
  or (payout_schedule = 'weekly' and payout_day_1 between 0 and 6 and payout_day_2 is null)
  or (payout_schedule = 'biweekly' and payout_day_1 between 1 and 31 and payout_day_2 between 1 and 31 and payout_day_1 < payout_day_2)
  or (payout_schedule = 'monthly' and payout_day_1 between 1 and 31 and payout_day_2 is null)
);
alter table public.barbers add constraint barbers_payout_needs_commission check (
  payout_schedule = 'none' or (compensation_type = 'commission' and payout_tracking_start is not null)
);

-- Existing commission barbers start tracking today: past work is not retroactively owed.
update public.barbers b
set payout_tracking_start = (now() at time zone s.timezone)::date
from public.shops s
where s.id = b.shop_id and b.compensation_type = 'commission';
```

- [ ] **Step 2: Tabela de pagamentos**

```sql
create table public.barber_payouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  barber_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  constraint barber_payouts_barber_fk foreign key (shop_id, barber_id) references public.barbers (shop_id, id) on delete restrict
);
create index barber_payouts_barber_paid_on_idx on public.barber_payouts (barber_id, paid_on);
alter table public.barber_payouts enable row level security;
revoke all on public.barber_payouts from public, anon, authenticated;
```

- [ ] **Step 3: Helpers internos**

```sql
create function public.payout_due_dates(sched public.payout_schedule, day_1 smallint, day_2 smallint, from_date date, to_date date)
returns setof date
language sql
immutable
as $$
  select g.d::date
  from generate_series(from_date::timestamp, to_date::timestamp, interval '1 day') g(d)
  cross join lateral (
    select extract(day from (date_trunc('month', g.d) + interval '1 month - 1 day'))::int as last_day
  ) m
  where case sched
    when 'weekly' then extract(dow from g.d)::int = day_1
    when 'monthly' then extract(day from g.d)::int = least(day_1::int, m.last_day)
    when 'biweekly' then extract(day from g.d)::int in (least(day_1::int, m.last_day), least(day_2::int, m.last_day))
    else false
  end
  order by 1;
$$;

create function public.payout_earned_cents(target_barber uuid, from_date date, tz text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select round(coalesce(sum(a.service_price_cents_snapshot * public.commission_percent_at(a.barber_id, a.starts_at)), 0) / 100)::int
  from public.appointments a
  where a.barber_id = target_barber
    and a.status = 'completed'
    and a.starts_at >= from_date::timestamp at time zone tz;
$$;

create function public.payout_paid_cents(target_barber uuid, from_date date)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(sum(p.amount_cents), 0)::int
  from public.barber_payouts p
  where p.barber_id = target_barber and p.paid_on >= from_date;
$$;

revoke all on function public.payout_due_dates(public.payout_schedule, smallint, smallint, date, date) from public, anon, authenticated;
revoke all on function public.payout_earned_cents(uuid, date, text) from public, anon, authenticated;
revoke all on function public.payout_paid_cents(uuid, date) from public, anon, authenticated;
```

- [ ] **Step 4: RPCs do dono (agenda, registrar, listar, apagar)**

```sql
create function public.set_barber_payout_schedule(
  target_barber_id uuid,
  new_schedule public.payout_schedule,
  new_day_1 smallint default null,
  new_day_2 smallint default null,
  new_tracking_start date default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  target public.barbers%rowtype;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  select * into target from public.barbers where id = target_barber_id and shop_id = sh.id;
  if not found or target.compensation_type <> 'commission' then
    raise exception using errcode = 'P0039', message = 'PAYOUT_SCHEDULE_INVALID';
  end if;

  begin
    update public.barbers
    set payout_schedule = new_schedule,
        payout_day_1 = new_day_1,
        payout_day_2 = new_day_2,
        payout_tracking_start = coalesce(new_tracking_start, target.payout_tracking_start, (clock_timestamp() at time zone sh.timezone)::date),
        updated_at = clock_timestamp()
    where id = target_barber_id;
  exception when check_violation then
    raise exception using errcode = 'P0039', message = 'PAYOUT_SCHEDULE_INVALID';
  end;
end;
$$;

create function public.record_barber_payout(
  target_barber_id uuid,
  payout_amount_cents integer,
  payout_paid_on date,
  payout_note text default null
)
returns public.barber_payouts
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
  result public.barber_payouts;
  clean_note text := nullif(btrim(payout_note), '');
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  if payout_amount_cents is null or payout_amount_cents <= 0 or payout_paid_on is null
    or (clean_note is not null and char_length(clean_note) > 200)
    or not exists (
      select 1 from public.barbers b
      where b.id = target_barber_id and b.shop_id = sh.id and b.compensation_type = 'commission'
    )
  then
    raise exception using errcode = 'P0040', message = 'PAYOUT_INVALID';
  end if;

  insert into public.barber_payouts (shop_id, barber_id, amount_cents, paid_on, note)
  values (sh.id, target_barber_id, payout_amount_cents, payout_paid_on, clean_note)
  returning * into result;

  return result;
end;
$$;

create function public.list_barber_payouts(period_start date, period_end date)
returns table (id uuid, barber_id uuid, barber_name text, amount_cents integer, paid_on date, note text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;
  if period_end < period_start or period_end - period_start > 91 then
    raise exception using errcode = 'P0022', message = 'EARNINGS_INVALID_RANGE';
  end if;

  return query
  select p.id, p.barber_id, b.name, p.amount_cents, p.paid_on, p.note
  from public.barber_payouts p
  join public.barbers b on b.id = p.barber_id and b.shop_id = p.shop_id
  where p.shop_id = sh.id and p.paid_on between period_start and period_end
  order by p.paid_on desc, p.created_at desc;
end;
$$;

create function public.delete_barber_payout(payout_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh public.shops%rowtype;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;

  delete from public.barber_payouts where id = payout_id and shop_id = sh.id;
  if not found then
    raise exception using errcode = 'P0040', message = 'PAYOUT_INVALID';
  end if;
end;
$$;
```

- [ ] **Step 5: Visão geral do dono e resumo do barbeiro**

```sql
create function public.get_payout_overview()
returns table (
  barber_id uuid,
  barber_name text,
  payout_schedule public.payout_schedule,
  payout_day_1 smallint,
  payout_day_2 smallint,
  tracking_start date,
  earned_cents integer,
  paid_cents integer,
  balance_cents integer,
  last_due_date date,
  next_due_date date,
  status text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
#variable_conflict use_column
declare
  sh public.shops%rowtype;
  today date;
begin
  select * into sh from public.shops where owner_user_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception using errcode = 'P0029', message = 'REPORT_FORBIDDEN';
  end if;
  today := (clock_timestamp() at time zone sh.timezone)::date;

  return query
  with base as (
    select
      br.id,
      br.name,
      br.active,
      br.payout_schedule,
      br.payout_day_1,
      br.payout_day_2,
      coalesce(br.payout_tracking_start, (br.created_at at time zone sh.timezone)::date) as start_date
    from public.barbers br
    where br.shop_id = sh.id and br.compensation_type = 'commission'
  ), money as (
    select
      b.*,
      public.payout_earned_cents(b.id, b.start_date, sh.timezone) as earned,
      public.payout_paid_cents(b.id, b.start_date) as paid
    from base b
  ), due as (
    select
      m.*,
      (select max(x) from public.payout_due_dates(m.payout_schedule, m.payout_day_1, m.payout_day_2, m.start_date, today) x) as last_due,
      (select min(x) from public.payout_due_dates(m.payout_schedule, m.payout_day_1, m.payout_day_2, today, today + 62) x) as next_due
    from money m
  )
  select
    d.id,
    d.name,
    d.payout_schedule,
    d.payout_day_1,
    d.payout_day_2,
    d.start_date,
    d.earned,
    d.paid,
    d.earned - d.paid,
    d.last_due,
    d.next_due,
    case
      when d.payout_schedule = 'none' then 'no_schedule'
      when d.earned - d.paid <= 0 or d.last_due is null then 'ok'
      when d.last_due = today
        and not exists (select 1 from public.barber_payouts p where p.barber_id = d.id and p.paid_on >= today) then 'due_today'
      when d.last_due < today
        and not exists (select 1 from public.barber_payouts p where p.barber_id = d.id and p.paid_on >= d.last_due) then 'pending'
      else 'ok'
    end
  from due d
  where d.active or d.earned - d.paid <> 0
  order by d.name;
end;
$$;

create function public.get_my_payout_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  me public.barbers%rowtype;
  tz text;
  today date;
  start_date date;
begin
  select * into me from public.barbers where user_id = auth.uid() and active;
  if not found then
    raise exception using errcode = 'P0019', message = 'BARBER_NOT_LINKED';
  end if;
  if me.compensation_type <> 'commission' then
    return null;
  end if;

  select s.timezone into tz from public.shops s where s.id = me.shop_id;
  today := (clock_timestamp() at time zone tz)::date;
  start_date := coalesce(me.payout_tracking_start, (me.created_at at time zone tz)::date);

  -- Never returns gross revenue: only what is left to receive, the schedule and the barber's own payouts.
  return jsonb_build_object(
    'schedule', me.payout_schedule,
    'day_1', me.payout_day_1,
    'day_2', me.payout_day_2,
    'tracking_start', start_date,
    'balance_cents', public.payout_earned_cents(me.id, start_date, tz) - public.payout_paid_cents(me.id, start_date),
    'next_due_date', (select min(x) from public.payout_due_dates(me.payout_schedule, me.payout_day_1, me.payout_day_2, today, today + 62) x),
    'past_unmarked_count', (
      select count(*)::int from public.appointments a
      where a.barber_id = me.id and a.status in ('scheduled', 'confirmed')
        and a.starts_at >= start_date::timestamp at time zone tz and a.starts_at < clock_timestamp()
    ),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'paid_on', p.paid_on, 'amount_cents', p.amount_cents, 'note', p.note) order by p.paid_on desc, p.created_at desc)
      from (
        select * from public.barber_payouts p0 where p0.barber_id = me.id order by p0.paid_on desc, p0.created_at desc limit 50
      ) p
    ), '[]'::jsonb)
  );
end;
$$;
```

- [ ] **Step 6: `set_barber_compensation` zera a agenda ao virar aluguel**

Copie a função `public.set_barber_compensation` inteira de `supabase/migrations/0060_commission_rate_history.sql` para o fim de `0061` como `create or replace function` (mesma assinatura de seis argumentos; `create or replace` mantém grants, mas repita `revoke`/`grant` ao final por segurança). Faça estas três mudanças:

1. No `declare`, acrescente `local_today date;`.
2. Logo após o bloco de validação de `new_type`, acrescente:
```sql
  select (clock_timestamp() at time zone s.timezone)::date into local_today from public.shops s where s.id = target_shop;
```
3. No `update public.barbers set ...` final, acrescente antes de `updated_at`:
```sql
    payout_schedule = case when new_type = 'chair_rental' then 'none'::public.payout_schedule else barbers.payout_schedule end,
    payout_day_1 = case when new_type = 'chair_rental' then null else barbers.payout_day_1 end,
    payout_day_2 = case when new_type = 'chair_rental' then null else barbers.payout_day_2 end,
    payout_tracking_start = case
      when new_type = 'chair_rental' then null
      when old_type is distinct from 'commission' then local_today
      else barbers.payout_tracking_start
    end,
```

- [ ] **Step 7: Permissões**

```sql
revoke all on function public.set_barber_payout_schedule(uuid, public.payout_schedule, smallint, smallint, date) from public, anon;
revoke all on function public.record_barber_payout(uuid, integer, date, text) from public, anon;
revoke all on function public.list_barber_payouts(date, date) from public, anon;
revoke all on function public.delete_barber_payout(uuid) from public, anon;
revoke all on function public.get_payout_overview() from public, anon;
revoke all on function public.get_my_payout_summary() from public, anon;
grant execute on function public.set_barber_payout_schedule(uuid, public.payout_schedule, smallint, smallint, date) to authenticated;
grant execute on function public.record_barber_payout(uuid, integer, date, text) to authenticated;
grant execute on function public.list_barber_payouts(date, date) to authenticated;
grant execute on function public.delete_barber_payout(uuid) to authenticated;
grant execute on function public.get_payout_overview() to authenticated;
grant execute on function public.get_my_payout_summary() to authenticated;
```

- [ ] **Step 8: Aplicar e rodar**

Run: `rtk npx supabase migration up && rtk npx supabase test db`
Expected: `043_barber_payouts.sql` passa (27 asserções) e os testes antigos continuam verdes, em especial `042_commission_history.sql` (a redefinição de `set_barber_compensation` não pode regredir o PR1) e `013_barber_role.sql`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0061_barber_payouts.sql supabase/tests/043_barber_payouts.sql
git commit -m "feat(db): barber payouts - schedule, payments, balance, overview"
```

---

### Task 3: Tipos, regras puras e API do app

**Files:**
- Create: `src/features/payouts/types.ts`, `schedule.ts`, `balance.ts`, `format.ts`, `api.ts`
- Create: `tests/unit/payout-schedule.test.ts`, `tests/unit/payout-balance.test.ts`, `tests/integration/payouts.test.ts`
- Modify: `src/lib/errors/domain-errors.ts`

**Interfaces:**
- Produces:
  - `PayoutSchedule = "none" | "weekly" | "biweekly" | "monthly"`, `PayoutStatus = "no_schedule" | "ok" | "due_today" | "pending"`.
  - `PayoutScheduleConfig = { day1: number | null; day2: number | null; schedule: PayoutSchedule }`.
  - `PayoutOverviewItem = { balanceCents: number; barberId: string; barberName: string; config: PayoutScheduleConfig; earnedCents: number; lastDueDate: string | null; nextDueDate: string | null; paidCents: number; status: PayoutStatus; trackingStart: string }`.
  - `PayoutListItem = { amountCents: number; barberId: string; barberName: string; id: string; note: string | null; paidOn: string }`.
  - `MyPayoutSummary = { balanceCents: number; config: PayoutScheduleConfig; nextDueDate: string | null; pastUnmarkedCount: number; payouts: { amountCents: number; id: string; note: string | null; paidOn: string }[]; trackingStart: string }`.
  - `isValidSchedule(config): boolean`; `describeSchedule(config): { key: string; params: Record<string, number | string> }` (chaves `payouts.schedule.{none|weekly|biweekly|monthly}`, `weekly` usa `params.weekday = "payouts.everyWeekday.<n>"`-resolvido pelo chamador via `t`).
  - `payoutBadge(status, balanceCents): { key: "dueToday" | "noSchedule" | "ok" | "overpaid" | "pending" | "settled"; tone: "danger" | "neutral" | "success" | "warning" }`.
  - `formatDayMonth(iso: string): string` → `"dd/mm"`.
  - API: `getPayoutOverview(supabase)`, `setBarberPayoutSchedule(supabase, barberId, config, trackingStart?)`, `recordBarberPayout(supabase, { amountCents, barberId, note?, paidOn })`, `listBarberPayouts(supabase, start, end)`, `deleteBarberPayout(supabase, id)`, `getMyPayoutSummary(supabase)` (nulo para barbeiro que não é de comissão).

- [ ] **Step 1: Testes puros (falham primeiro)**

`tests/unit/payout-schedule.test.ts`:
```ts
import { describeSchedule, isValidSchedule } from "../../src/features/payouts/schedule";

describe("isValidSchedule", () => {
  it("accepts none without days", () => expect(isValidSchedule({ day1: null, day2: null, schedule: "none" })).toBe(true));
  it("rejects none with a day", () => expect(isValidSchedule({ day1: 3, day2: null, schedule: "none" })).toBe(false));
  it("weekly needs a weekday 0 to 6", () => {
    expect(isValidSchedule({ day1: 0, day2: null, schedule: "weekly" })).toBe(true);
    expect(isValidSchedule({ day1: 7, day2: null, schedule: "weekly" })).toBe(false);
    expect(isValidSchedule({ day1: null, day2: null, schedule: "weekly" })).toBe(false);
  });
  it("biweekly needs two ascending days of the month", () => {
    expect(isValidSchedule({ day1: 5, day2: 20, schedule: "biweekly" })).toBe(true);
    expect(isValidSchedule({ day1: 20, day2: 5, schedule: "biweekly" })).toBe(false);
    expect(isValidSchedule({ day1: 5, day2: 5, schedule: "biweekly" })).toBe(false);
    expect(isValidSchedule({ day1: 5, day2: 32, schedule: "biweekly" })).toBe(false);
  });
  it("monthly needs one day 1 to 31", () => {
    expect(isValidSchedule({ day1: 31, day2: null, schedule: "monthly" })).toBe(true);
    expect(isValidSchedule({ day1: 0, day2: null, schedule: "monthly" })).toBe(false);
  });
});

describe("describeSchedule", () => {
  it("returns a translation key and params", () => {
    expect(describeSchedule({ day1: 1, day2: null, schedule: "weekly" })).toEqual({ key: "payouts.schedule.weekly", params: { weekdayKey: "payouts.everyWeekday.1" } });
    expect(describeSchedule({ day1: 5, day2: 20, schedule: "biweekly" })).toEqual({ key: "payouts.schedule.biweekly", params: { day1: 5, day2: 20 } });
    expect(describeSchedule({ day1: 15, day2: null, schedule: "monthly" })).toEqual({ key: "payouts.schedule.monthly", params: { day: 15 } });
    expect(describeSchedule({ day1: null, day2: null, schedule: "none" })).toEqual({ key: "payouts.schedule.none", params: {} });
  });
});
```

`tests/unit/payout-balance.test.ts`:
```ts
import { formatDayMonth } from "../../src/features/payouts/format";
import { payoutBadge } from "../../src/features/payouts/balance";

describe("payoutBadge", () => {
  it("a negative balance is overpaid regardless of status", () => expect(payoutBadge("ok", -2000)).toEqual({ key: "overpaid", tone: "warning" }));
  it("due today warns", () => expect(payoutBadge("due_today", 5000)).toEqual({ key: "dueToday", tone: "warning" }));
  it("pending is the danger state", () => expect(payoutBadge("pending", 5000)).toEqual({ key: "pending", tone: "danger" }));
  it("no schedule is neutral", () => expect(payoutBadge("no_schedule", 5000)).toEqual({ key: "noSchedule", tone: "neutral" }));
  it("settled when nothing is left", () => expect(payoutBadge("ok", 0)).toEqual({ key: "settled", tone: "success" }));
  it("ok with a balance still left", () => expect(payoutBadge("ok", 1000)).toEqual({ key: "ok", tone: "success" }));
});

describe("formatDayMonth", () => {
  it("renders dd/mm from an ISO date", () => expect(formatDayMonth("2026-10-05")).toBe("05/10"));
});
```

- [ ] **Step 2: Rodar e ver falhar** — `rtk npx jest tests/unit/payout-schedule.test.ts tests/unit/payout-balance.test.ts` → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar tipos e regras**

`src/features/payouts/types.ts` — os tipos listados em "Interfaces", mais as linhas cruas do banco:
```ts
export type PayoutSchedule = "none" | "weekly" | "biweekly" | "monthly";
export type PayoutStatus = "no_schedule" | "ok" | "due_today" | "pending";
export type PayoutScheduleConfig = { day1: number | null; day2: number | null; schedule: PayoutSchedule };

export type PayoutOverviewItem = {
  balanceCents: number;
  barberId: string;
  barberName: string;
  config: PayoutScheduleConfig;
  earnedCents: number;
  lastDueDate: string | null;
  nextDueDate: string | null;
  paidCents: number;
  status: PayoutStatus;
  trackingStart: string;
};

export type PayoutListItem = { amountCents: number; barberId: string; barberName: string; id: string; note: string | null; paidOn: string };

export type MyPayoutSummary = {
  balanceCents: number;
  config: PayoutScheduleConfig;
  nextDueDate: string | null;
  pastUnmarkedCount: number;
  payouts: { amountCents: number; id: string; note: string | null; paidOn: string }[];
  trackingStart: string;
};

export type OverviewRow = {
  balance_cents: number; barber_id: string; barber_name: string; earned_cents: number; last_due_date: string | null; next_due_date: string | null;
  paid_cents: number; payout_day_1: number | null; payout_day_2: number | null; payout_schedule: PayoutSchedule; status: PayoutStatus; tracking_start: string;
};

export type PayoutRow = { amount_cents: number; barber_id: string; barber_name?: string; id: string; note: string | null; paid_on: string };

export type SummaryRow = {
  balance_cents: number; day_1: number | null; day_2: number | null; next_due_date: string | null; past_unmarked_count: number;
  payouts: { amount_cents: number; id: string; note: string | null; paid_on: string }[]; schedule: PayoutSchedule; tracking_start: string;
};
```

`src/features/payouts/schedule.ts`:
```ts
import type { PayoutScheduleConfig } from "./types";

const inRange = (value: number | null, min: number, max: number) => value !== null && Number.isInteger(value) && value >= min && value <= max;

export function isValidSchedule({ day1, day2, schedule }: PayoutScheduleConfig): boolean {
  if (schedule === "none") return day1 === null && day2 === null;
  if (schedule === "weekly") return inRange(day1, 0, 6) && day2 === null;
  if (schedule === "biweekly") return inRange(day1, 1, 31) && inRange(day2, 1, 31) && (day1 as number) < (day2 as number);

  return inRange(day1, 1, 31) && day2 === null;
}

// Resolved by the caller with `t(key, params)`; the weekly case carries the key of the weekday phrase ("toda segunda").
export function describeSchedule({ day1, day2, schedule }: PayoutScheduleConfig): { key: string; params: Record<string, number | string> } {
  if (schedule === "weekly") return { key: "payouts.schedule.weekly", params: { weekdayKey: `payouts.everyWeekday.${day1}` } };
  if (schedule === "biweekly") return { key: "payouts.schedule.biweekly", params: { day1: day1 as number, day2: day2 as number } };
  if (schedule === "monthly") return { key: "payouts.schedule.monthly", params: { day: day1 as number } };

  return { key: "payouts.schedule.none", params: {} };
}
```

`src/features/payouts/balance.ts`:
```ts
import type { PayoutStatus } from "./types";

export type PayoutBadge = { key: "dueToday" | "noSchedule" | "ok" | "overpaid" | "pending" | "settled"; tone: "danger" | "neutral" | "success" | "warning" };

export function payoutBadge(status: PayoutStatus, balanceCents: number): PayoutBadge {
  if (balanceCents < 0) return { key: "overpaid", tone: "warning" };
  if (status === "due_today") return { key: "dueToday", tone: "warning" };
  if (status === "pending") return { key: "pending", tone: "danger" };
  if (status === "no_schedule") return { key: "noSchedule", tone: "neutral" };

  return balanceCents === 0 ? { key: "settled", tone: "success" } : { key: "ok", tone: "success" };
}
```

`src/features/payouts/format.ts`:
```ts
// "2026-10-05" -> "05/10". Dates here are shop-local calendar dates, so no timezone maths is involved.
export function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split("-");

  return `${day}/${month}`;
}
```

- [ ] **Step 4: Códigos de erro**

Em `src/lib/errors/domain-errors.ts`: acrescente `| "PAYOUT_INVALID" | "PAYOUT_SCHEDULE_INVALID"` ao `DomainErrorCode` e, no `switch`, antes do `default`:
```ts
    case "P0039":
      return new DomainError("PAYOUT_SCHEDULE_INVALID", "Check the payout schedule and days.");
    case "P0040":
      return new DomainError("PAYOUT_INVALID", "Enter a valid payout for a commission barber.");
```

- [ ] **Step 5: Teste de integração da API (falha primeiro)**

`tests/integration/payouts.test.ts`:
```ts
import { deleteBarberPayout, getMyPayoutSummary, getPayoutOverview, recordBarberPayout, setBarberPayoutSchedule } from "../../src/features/payouts/api";

describe("payouts api", () => {
  it("maps the overview rows", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ balance_cents: 7000, barber_id: "b1", barber_name: "Ana", earned_cents: 10000, last_due_date: "2026-10-26", next_due_date: "2026-11-02", paid_cents: 3000, payout_day_1: 1, payout_day_2: null, payout_schedule: "weekly", status: "pending", tracking_start: "2026-10-01" }],
      error: null,
    });

    await expect(getPayoutOverview({ rpc } as never)).resolves.toEqual([
      { balanceCents: 7000, barberId: "b1", barberName: "Ana", config: { day1: 1, day2: null, schedule: "weekly" }, earnedCents: 10000, lastDueDate: "2026-10-26", nextDueDate: "2026-11-02", paidCents: 3000, status: "pending", trackingStart: "2026-10-01" },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_payout_overview");
  });

  it("sends the schedule with explicit nulls", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await setBarberPayoutSchedule({ rpc } as never, "b1", { day1: 5, day2: 20, schedule: "biweekly" }, "2026-10-01");

    expect(rpc).toHaveBeenCalledWith("set_barber_payout_schedule", { new_day_1: 5, new_day_2: 20, new_schedule: "biweekly", new_tracking_start: "2026-10-01", target_barber_id: "b1" });
  });

  it("records a payout and trims the note", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { amount_cents: 3000, barber_id: "b1", id: "p1", note: "x", paid_on: "2026-10-27" }, error: null });

    await expect(recordBarberPayout({ rpc } as never, { amountCents: 3000, barberId: "b1", note: "  x ", paidOn: "2026-10-27" })).resolves.toMatchObject({ amountCents: 3000, id: "p1" });
    expect(rpc).toHaveBeenCalledWith("record_barber_payout", { payout_amount_cents: 3000, payout_note: "x", payout_paid_on: "2026-10-27", target_barber_id: "b1" });
  });

  it("turns a database error code into a domain error", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0040" } });

    await expect(deleteBarberPayout({ rpc } as never, "p1")).rejects.toMatchObject({ code: "PAYOUT_INVALID" });
  });

  it("returns null for a barber who is not on commission", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await expect(getMyPayoutSummary({ rpc } as never)).resolves.toBeNull();
  });
});
```

- [ ] **Step 6: Implementar `api.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import type { MyPayoutSummary, OverviewRow, PayoutListItem, PayoutOverviewItem, PayoutRow, PayoutScheduleConfig, SummaryRow } from "./types";

type Rpc = Pick<SupabaseClient, "rpc">;

function fail(error: { code?: string }): never {
  const domainError = toDomainError(error);

  throw domainError.code === "BOOKING_REQUEST_FAILED" ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the request.") : domainError;
}

const first = <T>(data: unknown) => (Array.isArray(data) ? data[0] : data) as T | null;

export async function getPayoutOverview(supabase: Rpc): Promise<PayoutOverviewItem[]> {
  const { data, error } = await supabase.rpc("get_payout_overview");
  if (error) fail(error);

  return ((data ?? []) as OverviewRow[]).map((row) => ({
    balanceCents: row.balance_cents,
    barberId: row.barber_id,
    barberName: row.barber_name,
    config: { day1: row.payout_day_1, day2: row.payout_day_2, schedule: row.payout_schedule },
    earnedCents: row.earned_cents,
    lastDueDate: row.last_due_date,
    nextDueDate: row.next_due_date,
    paidCents: row.paid_cents,
    status: row.status,
    trackingStart: row.tracking_start,
  }));
}

export async function setBarberPayoutSchedule(supabase: Rpc, barberId: string, config: PayoutScheduleConfig, trackingStart?: string | null) {
  const { error } = await supabase.rpc("set_barber_payout_schedule", {
    new_day_1: config.day1,
    new_day_2: config.day2,
    new_schedule: config.schedule,
    new_tracking_start: trackingStart ?? null,
    target_barber_id: barberId,
  });
  if (error) fail(error);
}

export async function recordBarberPayout(supabase: Rpc, input: { amountCents: number; barberId: string; note?: string | null; paidOn: string }) {
  const { data, error } = await supabase.rpc("record_barber_payout", {
    payout_amount_cents: input.amountCents,
    payout_note: input.note?.trim() || null,
    payout_paid_on: input.paidOn,
    target_barber_id: input.barberId,
  });
  if (error) fail(error);

  const row = first<PayoutRow>(data);
  if (!row) fail({ code: "unknown" });

  return { amountCents: row.amount_cents, barberId: row.barber_id, id: row.id, note: row.note, paidOn: row.paid_on };
}

export async function listBarberPayouts(supabase: Rpc, start: string, end: string): Promise<PayoutListItem[]> {
  const { data, error } = await supabase.rpc("list_barber_payouts", { period_end: end, period_start: start });
  if (error) fail(error);

  return ((data ?? []) as PayoutRow[]).map((row) => ({ amountCents: row.amount_cents, barberId: row.barber_id, barberName: row.barber_name ?? "", id: row.id, note: row.note, paidOn: row.paid_on }));
}

export async function deleteBarberPayout(supabase: Rpc, id: string) {
  const { error } = await supabase.rpc("delete_barber_payout", { payout_id: id });
  if (error) fail(error);
}

export async function getMyPayoutSummary(supabase: Rpc): Promise<MyPayoutSummary | null> {
  const { data, error } = await supabase.rpc("get_my_payout_summary");
  if (error) fail(error);
  if (!data) return null;

  const row = data as SummaryRow;

  return {
    balanceCents: row.balance_cents,
    config: { day1: row.day_1, day2: row.day_2, schedule: row.schedule },
    nextDueDate: row.next_due_date,
    pastUnmarkedCount: row.past_unmarked_count,
    payouts: row.payouts.map((p) => ({ amountCents: p.amount_cents, id: p.id, note: p.note, paidOn: p.paid_on })),
    trackingStart: row.tracking_start,
  };
}
```

- [ ] **Step 7: Rodar e ver passar**

Run: `rtk npx jest tests/unit/payout-schedule.test.ts tests/unit/payout-balance.test.ts tests/integration/payouts.test.ts && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/payouts src/lib/errors tests
git commit -m "feat: payouts domain types, schedule and balance rules, api"
```

---

### Task 4: Textos (pt, es, en) e códigos de erro traduzidos

**Files:**
- Modify: `src/i18n/locales/pt.ts`, `es.ts`, `en.ts`

**Interfaces:**
- Produces: grupo `payouts` (nível raiz de cada locale) com as chaves abaixo e `errors.codes.PAYOUT_INVALID`, `errors.codes.PAYOUT_SCHEDULE_INVALID`.

- [ ] **Step 1: Acrescentar o grupo `payouts` aos três arquivos (mesmas chaves)**

pt:
```ts
  payouts: {
    badge: { dueToday: "Vence hoje", noSchedule: "Sem agenda", ok: "Em dia", overpaid: "Pago a mais", pending: "Pendente", settled: "Quitado" },
    balance: "Saldo a repassar",
    balanceOverpaid: "Pago a mais",
    confirmDelete: "Toque de novo para apagar",
    delete: "Apagar",
    empty: "Nenhum barbeiro de comissão.",
    everyWeekday: { 0: "todo domingo", 1: "toda segunda", 2: "toda terça", 3: "toda quarta", 4: "toda quinta", 5: "toda sexta", 6: "todo sábado" },
    form: { amount: "Valor pago", date: "Data do pagamento (AAAA-MM-DD)", dateInvalid: "Use a data no formato AAAA-MM-DD.", note: "Observação (opcional)", save: "Registrar repasse" },
    history: "Repasses pagos",
    historyEmpty: "Nenhum repasse nos últimos 90 dias.",
    next: "Próximo repasse: {{date}}",
    pay: "Pagar",
    recorded: "Repasse registrado.",
    removed: "Repasse apagado.",
    schedule: {
      biweekly: "Quinzenal · dias {{day1}} e {{day2}}",
      label: "Repasse",
      monthly: "Mensal · dia {{day}}",
      none: "Sem agenda fixa (avulso)",
      options: { biweekly: "Quinzenal", monthly: "Mensal", none: "Sem agenda fixa", weekly: "Semanal" },
      saved: "Agenda de repasse salva.",
      shortMonthHint: "Em meses curtos, vale o último dia do mês.",
      trackingStart: "Controlar a partir de (AAAA-MM-DD)",
      weekly: "Semanal · {{weekdayKey}}",
    },
    title: "Repasses",
    weekdayShort: { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" },
    barber: {
      pastUnmarked: "{{count}} atendimentos passados sem baixa ainda não entram no cálculo.",
      receivable: "A receber até o momento",
      since: "Contando desde {{date}}",
      title: "Repasse",
    },
  },
```
es:
```ts
  payouts: {
    badge: { dueToday: "Vence hoy", noSchedule: "Sin agenda", ok: "Al día", overpaid: "Pagado de más", pending: "Pendiente", settled: "Saldado" },
    balance: "Saldo por pagar",
    balanceOverpaid: "Pagado de más",
    confirmDelete: "Toca otra vez para borrar",
    delete: "Borrar",
    empty: "No hay barberos por comisión.",
    everyWeekday: { 0: "cada domingo", 1: "cada lunes", 2: "cada martes", 3: "cada miércoles", 4: "cada jueves", 5: "cada viernes", 6: "cada sábado" },
    form: { amount: "Monto pagado", date: "Fecha del pago (AAAA-MM-DD)", dateInvalid: "Usa la fecha con el formato AAAA-MM-DD.", note: "Nota (opcional)", save: "Registrar pago" },
    history: "Pagos realizados",
    historyEmpty: "Ningún pago en los últimos 90 días.",
    next: "Próximo pago: {{date}}",
    pay: "Pagar",
    recorded: "Pago registrado.",
    removed: "Pago borrado.",
    schedule: {
      biweekly: "Quincenal · días {{day1}} y {{day2}}",
      label: "Pago al barbero",
      monthly: "Mensual · día {{day}}",
      none: "Sin agenda fija (suelto)",
      options: { biweekly: "Quincenal", monthly: "Mensual", none: "Sin agenda fija", weekly: "Semanal" },
      saved: "Agenda de pago guardada.",
      shortMonthHint: "En meses cortos vale el último día del mes.",
      trackingStart: "Controlar desde (AAAA-MM-DD)",
      weekly: "Semanal · {{weekdayKey}}",
    },
    title: "Pagos a barberos",
    weekdayShort: { 0: "Dom", 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb" },
    barber: {
      pastUnmarked: "{{count}} citas pasadas sin cerrar aún no entran en el cálculo.",
      receivable: "Por cobrar hasta ahora",
      since: "Contando desde {{date}}",
      title: "Pago",
    },
  },
```
en:
```ts
  payouts: {
    badge: { dueToday: "Due today", noSchedule: "No schedule", ok: "Up to date", overpaid: "Overpaid", pending: "Pending", settled: "Settled" },
    balance: "Balance to pay",
    balanceOverpaid: "Overpaid",
    confirmDelete: "Tap again to delete",
    delete: "Delete",
    empty: "No commission barbers.",
    everyWeekday: { 0: "every Sunday", 1: "every Monday", 2: "every Tuesday", 3: "every Wednesday", 4: "every Thursday", 5: "every Friday", 6: "every Saturday" },
    form: { amount: "Amount paid", date: "Payment date (YYYY-MM-DD)", dateInvalid: "Use the date as YYYY-MM-DD.", note: "Note (optional)", save: "Record payout" },
    history: "Payouts made",
    historyEmpty: "No payouts in the last 90 days.",
    next: "Next payout: {{date}}",
    pay: "Pay",
    recorded: "Payout recorded.",
    removed: "Payout deleted.",
    schedule: {
      biweekly: "Twice a month · days {{day1}} and {{day2}}",
      label: "Payout",
      monthly: "Monthly · day {{day}}",
      none: "No fixed schedule (one-off)",
      options: { biweekly: "Twice a month", monthly: "Monthly", none: "No fixed schedule", weekly: "Weekly" },
      saved: "Payout schedule saved.",
      shortMonthHint: "In short months the last day of the month applies.",
      trackingStart: "Track from (YYYY-MM-DD)",
      weekly: "Weekly · {{weekdayKey}}",
    },
    title: "Payouts",
    weekdayShort: { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" },
    barber: {
      pastUnmarked: "{{count}} past appointments not closed out yet are not counted.",
      receivable: "Owed to you so far",
      since: "Counting since {{date}}",
      title: "Payout",
    },
  },
```
Em cada locale, em `errors.codes`, ao lado de `RENT_PAYMENT_INVALID`:
pt: `PAYOUT_INVALID: "Informe um valor válido para um barbeiro de comissão.", PAYOUT_SCHEDULE_INVALID: "Confira a agenda e os dias do repasse.",`
es: `PAYOUT_INVALID: "Ingresa un monto válido para un barbero por comisión.", PAYOUT_SCHEDULE_INVALID: "Revisa la agenda y los días del pago.",`
en: `PAYOUT_INVALID: "Enter a valid amount for a commission barber.", PAYOUT_SCHEDULE_INVALID: "Check the payout schedule and days.",`

> A frase semanal compõe duas chaves: `t("payouts.schedule.weekly", { weekdayKey: t(params.weekdayKey) })`. Os pronomes "todo/toda" ficam em `everyWeekday`, por isso a agenda semanal lê "Semanal · toda segunda".

Acrescente também em cada locale as chaves de navegação do hub: `owner.manage.payouts` (pt "Repasses", es "Pagos a barberos", en "Payouts") — veja onde está `owner.manage.plans` com `rtk grep -n "plans:" src/i18n/locales/pt.ts`.

- [ ] **Step 2: Verificar paridade**

Run: `rtk npx jest tests/unit && rtk npm run typecheck`
Expected: PASS (testes de paridade de locale e tipos).

- [ ] **Step 3: Commit**

```bash
git add src/i18n
git commit -m "feat(i18n): payouts texts and error codes in pt, es, en"
```

---

### Task 5: Agenda de repasse no cadastro do barbeiro

**Files:**
- Create: `src/features/payouts/owner/ScheduleEditor.tsx`
- Modify: `src/features/barbers/owner/CompensationEditor.tsx`
- Modify: `src/features/barbers/api.ts`, `src/features/barbers/types.ts` (expor a agenda no `OwnerBarber`)
- Test: `tests/e2e/owner-barbers.web.spec.ts`

**Interfaces:**
- Consumes: `setBarberPayoutSchedule`, `isValidSchedule`, `describeSchedule`.
- Produces: `ScheduleEditor({ barberId, current, onFeedback })`, onde `current: { config: PayoutScheduleConfig; trackingStart: string | null }`.

- [ ] **Step 1: Expor a agenda nas linhas de barbeiro**

`list_owner_barbers` não devolve as colunas novas. Em `0061_barber_payouts.sql`, acrescente (antes dos grants) a recriação da função de listagem com as colunas `payout_schedule`, `payout_day_1`, `payout_day_2`, `payout_tracking_start`: copie `public.list_owner_barbers` da última migração que a definiu (`rtk grep -ln "function public.list_owner_barbers" supabase/migrations`), `drop function` + `create function` com as quatro colunas extras no `returns table` e no `select`, repetindo `revoke`/`grant`. Em `types.ts`, acrescente a `OwnerBarber`: `payout: { config: PayoutScheduleConfig; trackingStart: string | null }` e, em `api.ts`, o mapeamento a partir de `payout_schedule/payout_day_1/payout_day_2/payout_tracking_start`. Atualize os mocks de `tests/e2e/owner-barbers.web.spec.ts` e os fixtures de teste de `listOwnerBarbers` com `payout_schedule: "none"` (e dias `null`).

- [ ] **Step 2: Teste e2e (falha primeiro)**

No `owner-barbers.web.spec.ts`, adicione ao `mockOwnerRest` o tratamento de `/rpc/set_barber_payout_schedule` (guarda `calls.schedule = route.request().postDataJSON()` e responde `json(route, null)`), e o teste:

```ts
test("the owner sets a weekly payout day for a commission barber", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/barber-profile?id=b1");

  await page.getByTestId("payout-schedule-weekly").click();
  await page.getByTestId("payout-weekday-1").click();
  await page.getByTestId("payout-schedule-save").click();

  await expect.poll(() => calls.schedule).toMatchObject({ new_day_1: 1, new_day_2: null, new_schedule: "weekly", target_barber_id: "b1" });
});

test("a chair-rental barber has no payout schedule", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.goto("/barber-profile?id=b2");

  await expect(page.getByTestId("payout-schedule-weekly")).toHaveCount(0);
});
```

Run: `rtk npm run e2e:export && rtk npx playwright test tests/e2e/owner-barbers.web.spec.ts` → Expected: FAIL.

- [ ] **Step 3: Implementar `ScheduleEditor`**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { errorMessage } from "../../../i18n/errors";
import { useSupabaseSession } from "../../../providers/AppProviders";
import { setBarberPayoutSchedule } from "../api";
import { isValidSchedule, scheduleText } from "../schedule";
import type { PayoutSchedule, PayoutScheduleConfig } from "../types";

const SCHEDULES: PayoutSchedule[] = ["none", "weekly", "biweekly", "monthly"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

type Props = {
  barberId: string;
  current: { config: PayoutScheduleConfig; trackingStart: string | null };
  onFeedback: (message: string, variant: "error" | "success") => void;
};

export function ScheduleEditor({ barberId, current, onFeedback }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [schedule, setSchedule] = useState<PayoutSchedule>(current.config.schedule);
  const [day1, setDay1] = useState<string>(current.config.day1 === null ? "" : String(current.config.day1));
  const [day2, setDay2] = useState<string>(current.config.day2 === null ? "" : String(current.config.day2));
  const [trackingStart, setTrackingStart] = useState(current.trackingStart ?? "");

  const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));
  const config: PayoutScheduleConfig = {
    day1: schedule === "none" ? null : toNumber(day1),
    day2: schedule === "biweekly" ? toNumber(day2) : null,
    schedule,
  };
  const dateOk = trackingStart === "" || /^\d{4}-\d{2}-\d{2}$/.test(trackingStart);
  const valid = isValidSchedule(config) && dateOk;

  const save = useMutation({
    mutationFn: () => setBarberPayoutSchedule(supabase, barberId, config, trackingStart === "" ? null : trackingStart),
    onError: (error) => onFeedback(errorMessage(error, t, t("owner.barbers.compensationError")), "error"),
    onSuccess: () => {
      onFeedback(t("payouts.schedule.saved"), "success");
      void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] });
      void queryClient.invalidateQueries({ queryKey: ["payout-overview"] });
    },
  });

  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-base font-display-semibold text-ink">{t("payouts.schedule.label")}</Text>
      <Text className="text-sm font-sans text-neutral-600" testID="payout-schedule-summary">{scheduleText(t, current.config)}</Text>
      <View className="flex-row flex-wrap gap-2">
        {SCHEDULES.map((option) => (
          <Button key={option} label={t(`payouts.schedule.options.${option}`)} onPress={() => setSchedule(option)} size="sm" testID={`payout-schedule-${option}`} variant={schedule === option ? "dark" : "outline"} />
        ))}
      </View>
      {schedule === "weekly" ? (
        <View className="flex-row flex-wrap gap-2">
          {WEEKDAYS.map((weekday) => (
            <Button key={weekday} label={t(`payouts.weekdayShort.${weekday}`)} onPress={() => setDay1(String(weekday))} size="sm" testID={`payout-weekday-${weekday}`} variant={day1 === String(weekday) ? "dark" : "outline"} />
          ))}
        </View>
      ) : null}
      {schedule === "biweekly" ? (
        <View className="flex-row gap-2">
          <View className="flex-1"><Input keyboardType="numeric" label="1" onChangeText={setDay1} testID="payout-day-1" value={day1} /></View>
          <View className="flex-1"><Input keyboardType="numeric" label="2" onChangeText={setDay2} testID="payout-day-2" value={day2} /></View>
        </View>
      ) : null}
      {schedule === "monthly" ? <Input keyboardType="numeric" label={t("payouts.schedule.label")} onChangeText={setDay1} testID="payout-day-1" value={day1} /> : null}
      {schedule === "biweekly" || schedule === "monthly" ? <Text className="text-xs font-sans text-neutral-600">{t("payouts.schedule.shortMonthHint")}</Text> : null}
      <Input label={t("payouts.schedule.trackingStart")} onChangeText={setTrackingStart} placeholder={t("examples.date")} testID="payout-tracking-start" value={trackingStart} />
      <Button disabled={!valid || save.isPending} label={t("owner.barbers.saveCompensation")} onPress={() => save.mutate()} size="sm" testID="payout-schedule-save" />
    </View>
  );
}
```

O `scheduleText` é o helper de `schedule.ts` definido na Task 6 (resolve `weekdayKey` com `t` antes de montar a frase); como a Task 5 vem antes, crie-o já aqui, junto com o teste unitário descrito na Task 6, e a Task 6 apenas o reutiliza. Se `examples.date` não existir, veja `rtk grep -n "examples:" src/i18n/locales/en.ts` e acrescente a chave nos três locales (valor `"2026-10-27"`).

Em `CompensationEditor`, renderize o editor só quando o barbeiro está salvo como comissão e a edição não está aberta:

```tsx
{!editing && barber.compensation.type === "commission" ? (
  <ScheduleEditor barberId={barber.id} current={barber.payout} key={`${barber.id}-${barber.payout.config.schedule}-${barber.payout.config.day1}`} onFeedback={onFeedback} />
) : null}
```

- [ ] **Step 4: Rodar**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest && rtk npm run e2e:export && rtk npx playwright test tests/e2e/owner-barbers.web.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests supabase/migrations/0061_barber_payouts.sql
git commit -m "feat: payout schedule editor in the barber compensation card"
```

---

### Task 6: Tela "Repasses" do dono

**Files:**
- Create: `app/(owner)/payouts.tsx`, `src/features/payouts/owner/PayoutCard.tsx`, `PayoutForm.tsx`, `PayoutHistory.tsx`
- Modify: `app/(owner)/_layout.tsx` (`MANAGE_SCREENS` ganha `"payouts"`), `app/(owner)/manage.tsx` (item "Repasses")
- Test: `tests/e2e/owner-payouts.web.spec.ts`

**Interfaces:**
- Consumes: `getPayoutOverview`, `recordBarberPayout`, `listBarberPayouts`, `deleteBarberPayout`, `payoutBadge`, `describeSchedule`, `formatDayMonth`, `parseReaisToCents`, `centsToReaisInput`, `formatPriceBRL`.
- Produces: rota `/payouts`; `testID`s `payout-card-<barberId>`, `payout-pay-<barberId>`, `payout-amount`, `payout-date`, `payout-note`, `payout-submit`, `payout-delete-<id>`.

- [ ] **Step 1: Teste e2e (falha primeiro)**

```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

const overview = [
  { balance_cents: 7000, barber_id: "b1", barber_name: "Ana Barber", earned_cents: 10000, last_due_date: "2026-10-26", next_due_date: "2026-11-02", paid_cents: 3000, payout_day_1: 1, payout_day_2: null, payout_schedule: "weekly", status: "pending", tracking_start: "2026-10-01" },
  { balance_cents: 1500, barber_id: "b2", barber_name: "Caio Avulso", earned_cents: 1500, last_due_date: null, next_due_date: null, paid_cents: 0, payout_day_1: null, payout_day_2: null, payout_schedule: "none", status: "no_schedule", tracking_start: "2026-10-01" },
];

async function mockOwnerRest(page: Page, calls: Record<string, unknown>) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_payout_overview")) return json(route, overview);
    if (path.endsWith("/rpc/list_barber_payouts")) return json(route, []);
    if (path.endsWith("/rpc/record_barber_payout")) {
      calls.payout = route.request().postDataJSON();

      return json(route, { amount_cents: 7000, barber_id: "b1", id: "p1", note: null, paid_on: "2026-10-27" });
    }
    await route.abort();
  });
}

test("each commission barber shows schedule, balance and status", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});
  await page.goto("/payouts");

  await expect(page.getByTestId("payout-card-b1")).toContainText("Ana Barber");
  await expect(page.getByTestId("payout-card-b1")).toContainText("every Monday");
  await expect(page.getByTestId("payout-card-b1")).toContainText("R$ 70,00");
  await expect(page.getByTestId("payout-card-b1")).toContainText("Pending");
  await expect(page.getByTestId("payout-card-b2")).toContainText("No schedule");
});

test("paying starts filled with the balance and records the payout", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b1").click();

  await expect(page.getByTestId("payout-amount")).toHaveValue("70,00");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 7000, target_barber_id: "b1" });
});

test("a one-off payout works for a barber without a schedule", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b2").click();
  await page.getByTestId("payout-amount").fill("10");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 1000, target_barber_id: "b2" });
});
```

Run: `rtk npm run e2e:export && rtk npx playwright test tests/e2e/owner-payouts.web.spec.ts` → FAIL (rota não existe).

- [ ] **Step 2: Implementar os componentes**

`PayoutCard.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { payoutBadge } from "../balance";
import { formatDayMonth } from "../format";
import { scheduleText } from "../schedule";
import type { PayoutOverviewItem } from "../types";

const TONE_CLASS = { danger: "text-danger-500", neutral: "text-neutral-600", success: "text-success-600", warning: "text-warning-600" } as const;

export function PayoutCard({ item, onPay }: { item: PayoutOverviewItem; onPay: () => void }) {
  const { t } = useTranslation();
  const badge = payoutBadge(item.status, item.balanceCents);

  return (
    <Card variant="outlined">
      <View className="gap-2" testID={`payout-card-${item.barberId}`}>
        <View className="flex-row items-center justify-between gap-2">
          <Text accessibilityRole="header" className="flex-1 text-lg font-display-semibold text-ink">{item.barberName}</Text>
          <Text className={`text-sm font-sans-medium ${TONE_CLASS[badge.tone]}`}>{t(`payouts.badge.${badge.key}`)}</Text>
        </View>
        <Text className="text-sm font-sans text-neutral-600">{scheduleText(t, item.config)}</Text>
        <Text className="text-2xl font-display-bold text-ink">
          {item.balanceCents < 0 ? `${t("payouts.balanceOverpaid")} ${formatPriceBRL(-item.balanceCents)}` : formatPriceBRL(item.balanceCents)}
        </Text>
        {item.nextDueDate ? <Text className="text-sm font-sans text-neutral-600">{t("payouts.next", { date: formatDayMonth(item.nextDueDate) })}</Text> : null}
        <Button label={t("payouts.pay")} onPress={onPay} size="sm" testID={`payout-pay-${item.barberId}`} />
      </View>
    </Card>
  );
}
```

`PayoutForm.tsx`:
```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { centsToReaisInput, parseReaisToCents } from "../../../lib/money";

type Props = { balanceCents: number; busy: boolean; onCancel: () => void; onSubmit: (input: { amountCents: number; note: string; paidOn: string }) => void; today: string };

export function PayoutForm({ balanceCents, busy, onCancel, onSubmit, today }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(balanceCents > 0 ? centsToReaisInput(balanceCents) : "");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const amountCents = parseReaisToCents(amount);

    if (amountCents === null) return setError(t("errors.codes.PAYOUT_INVALID"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setError(t("payouts.form.dateInvalid"));
    setError(null);
    onSubmit({ amountCents, note, paidOn });
  };

  return (
    <View className="gap-2">
      <Input keyboardType="numeric" label={t("payouts.form.amount")} onChangeText={setAmount} testID="payout-amount" value={amount} />
      <Input label={t("payouts.form.date")} onChangeText={setPaidOn} testID="payout-date" value={paidOn} />
      <Input label={t("payouts.form.note")} onChangeText={setNote} testID="payout-note" value={note} />
      {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button disabled={busy} label={t("payouts.form.save")} onPress={submit} size="sm" testID="payout-submit" />
        <Button label={t("common.cancel")} onPress={onCancel} size="sm" variant="outline" />
      </View>
    </View>
  );
}
```

`PayoutHistory.tsx`:
```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Button } from "../../../components/ui/Button";
import { formatDayMonth } from "../format";
import type { PayoutListItem } from "../types";

// Removing needs a second tap on the same row, like the rent payments list.
export function PayoutHistory({ items, onDelete }: { items: PayoutListItem[]; onDelete: (id: string) => void }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState<string | null>(null);

  if (items.length === 0) return <Text className="text-sm font-sans text-neutral-600">{t("payouts.historyEmpty")}</Text>;

  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item.id} className="flex-row items-center justify-between gap-2" testID={`payout-row-${item.id}`}>
          <Text className="flex-1 text-sm font-sans text-ink">{`${formatDayMonth(item.paidOn)} · ${item.barberName} · ${formatPriceBRL(item.amountCents)}${item.note ? ` · ${item.note}` : ""}`}</Text>
          <Button
            label={armed === item.id ? t("payouts.confirmDelete") : t("payouts.delete")}
            onPress={() => (armed === item.id ? (setArmed(null), onDelete(item.id)) : setArmed(item.id))}
            size="sm"
            testID={`payout-delete-${item.id}`}
            variant={armed === item.id ? "danger" : "outline"}
          />
        </View>
      ))}
    </View>
  );
}
```

Acrescente a `schedule.ts` o helper `scheduleText` usado acima e no `ScheduleEditor` (e teste em `payout-schedule.test.ts`: `scheduleText` com um `t` falso que devolve `key|params` para conferir que `weekdayKey` é resolvido antes):
```ts
type Translate = (key: never, options?: never) => string;

export function scheduleText(t: Translate, config: PayoutScheduleConfig): string {
  const { key, params } = describeSchedule(config);
  const weekdayKey = params.weekdayKey;

  return (t as (k: string, o?: unknown) => string)(key, weekdayKey ? { ...params, weekdayKey: (t as (k: string) => string)(String(weekdayKey)) } : params);
}
```

- [ ] **Step 3: Tela**

`app/(owner)/payouts.tsx`:
```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { deleteBarberPayout, getPayoutOverview, listBarberPayouts, recordBarberPayout } from "../../src/features/payouts/api";
import { PayoutCard } from "../../src/features/payouts/owner/PayoutCard";
import { PayoutForm } from "../../src/features/payouts/owner/PayoutForm";
import { PayoutHistory } from "../../src/features/payouts/owner/PayoutHistory";
import { errorMessage } from "../../src/i18n/errors";
import { addLocalDays, localDateKey } from "../../src/lib/dates/local-date";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerPayoutsScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const pull = useRefreshAll();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = useMemo(() => localDateKey(new Date()), []);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  const overview = useQuery({ queryFn: () => getPayoutOverview(supabase), queryKey: ["payout-overview"] });
  const history = useQuery({ queryFn: () => listBarberPayouts(supabase, addLocalDays(today, -89), today), queryKey: ["payout-history", today] });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["payout-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["payout-history"] });
  };

  const record = useMutation({
    mutationFn: (input: { amountCents: number; barberId: string; note: string; paidOn: string }) => recordBarberPayout(supabase, input),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("errors.codes.PAYOUT_INVALID")), variant: "error" }),
    onSuccess: () => {
      setPayingId(null);
      setFeedback({ message: t("payouts.recorded"), variant: "success" });
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteBarberPayout(supabase, id),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("errors.codes.PAYOUT_INVALID")), variant: "error" }),
    onSuccess: () => {
      setFeedback({ message: t("payouts.removed"), variant: "success" });
      refresh();
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1" refreshControl={pullToRefresh(pull)}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("payouts.title")} />
            {feedback ? <Text className={`text-sm font-sans ${feedback.variant === "error" ? "text-danger-500" : "text-success-600"}`} testID="payouts-feedback">{feedback.message}</Text> : null}
            {overview.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {overview.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(overview.error, t, t("payouts.empty"))}</Text> : null}
            {overview.data?.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("payouts.empty")}</Text> : null}
            {overview.data?.map((item) => (
              <View key={item.barberId} className="gap-2">
                <PayoutCard item={item} onPay={() => setPayingId(item.barberId)} />
                {payingId === item.barberId ? (
                  <Card variant="outlined">
                    <PayoutForm balanceCents={item.balanceCents} busy={record.isPending} onCancel={() => setPayingId(null)} onSubmit={(input) => record.mutate({ ...input, barberId: item.barberId })} today={today} />
                  </Card>
                ) : null}
              </View>
            ))}
            <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("payouts.history")}</Text>
            <PayoutHistory items={history.data ?? []} onDelete={(id) => remove.mutate(id)} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
```

> Confirme os nomes reais dos helpers de data (`localDateKey`, `addLocalDays` — `revenue.tsx` já usa `addLocalDays`; veja `rtk grep -n "addLocalDays\|localDateKey\|today" "app/(owner)/revenue.tsx" | head` e importe de onde ele importa).

- [ ] **Step 4: Navegação**

Em `app/(owner)/_layout.tsx`, inclua `"payouts"` em `MANAGE_SCREENS` (ordem alfabética: depois de `"monthly-customers"`). Em `app/(owner)/manage.tsx`, importe o ícone `Wallet` de `lucide-react-native` e acrescente ao primeiro `MenuBlock`: `{ icon: Wallet, key: "payouts", label: t("owner.manage.payouts"), onPress: go("/payouts") },`.

- [ ] **Step 5: Rodar**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest && rtk npm run e2e:export && rtk npx playwright test tests/e2e/owner-payouts.web.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app src tests
git commit -m "feat: owner payouts screen - cards, pay form, history"
```

---

### Task 7: Visão do barbeiro

**Files:**
- Create: `src/features/payouts/barber/MyPayoutSection.tsx`
- Modify: `app/(barber)/my-profile/compensation.tsx`
- Test: `tests/e2e/barber-payouts.web.spec.ts`

**Interfaces:**
- Consumes: `getMyPayoutSummary`, `scheduleText`, `formatDayMonth`, `formatPriceBRL`.
- Produces: `testID`s `my-payout-balance`, `my-payout-next`, `my-payout-unmarked`, `my-payout-row-<id>`.

- [ ] **Step 1: Teste e2e (falha primeiro)**

```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { barberId, json, shopId } from "./customer-helpers";

const barberUserId = "66666666-6666-4666-8666-666666666666";

async function signIn(page: Page, userId: string) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: userId });
}

const profile = { avatar_url: null, bio: null, chair_rental_amount_cents: null, chair_rental_frequency: null, commission_percent: "40.00", compensation_type: "commission", id: barberId, name: "Browser Barber", shop_id: shopId };
const summary = {
  balance_cents: 7000, day_1: 1, day_2: null, next_due_date: "2026-11-02", past_unmarked_count: 3,
  payouts: [{ amount_cents: 3000, id: "p1", note: null, paid_on: "2026-10-20" }], schedule: "weekly", tracking_start: "2026-10-01",
};

async function mockBarberRest(page: Page, payoutSummary: unknown) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Browser Barber", role: "barber", user_id: barberUserId }]);
    if (path.endsWith("/rpc/get_my_barber_profile")) return json(route, [profile]);
    if (path.endsWith("/rpc/get_my_payout_summary")) return json(route, payoutSummary);
    await route.abort();
  });
}

test("the barber sees what is left to receive, the next date and the payouts received", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, summary);
  await page.goto("/my-profile/compensation");

  await expect(page.getByTestId("my-payout-balance")).toContainText("R$ 70,00");
  await expect(page.getByTestId("my-payout-next")).toContainText("02/11");
  await expect(page.getByTestId("my-payout-unmarked")).toContainText("3");
  await expect(page.getByTestId("my-payout-row-p1")).toContainText("R$ 30,00");
});

test("a chair-rental barber sees no payout section", async ({ page }) => {
  await signIn(page, barberUserId);
  await mockBarberRest(page, null);
  await page.goto("/my-profile/compensation");

  await expect(page.getByTestId("my-payout-balance")).toHaveCount(0);
});
```

Run → FAIL.

- [ ] **Step 2: Implementar**

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { Card } from "../../../components/ui/Card";
import { useSupabaseSession } from "../../../providers/AppProviders";
import { getMyPayoutSummary } from "../api";
import { formatDayMonth } from "../format";
import { scheduleText } from "../schedule";

export function MyPayoutSection() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const summary = useQuery({ queryFn: () => getMyPayoutSummary(supabase), queryKey: ["my-payout-summary", profile?.userId] });
  const data = summary.data;

  if (!data) return null;

  return (
    <Card variant="outlined">
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("payouts.barber.title")}</Text>
        <Text className="text-sm font-sans text-neutral-600">{t("payouts.barber.receivable")}</Text>
        <Text className="text-3xl font-display-bold text-ink" testID="my-payout-balance">
          {data.balanceCents < 0 ? `${t("payouts.balanceOverpaid")} ${formatPriceBRL(-data.balanceCents)}` : formatPriceBRL(data.balanceCents)}
        </Text>
        <Text className="text-xs font-sans text-neutral-600">{t("payouts.barber.since", { date: formatDayMonth(data.trackingStart) })}</Text>
        <Text className="text-sm font-sans text-ink">{scheduleText(t, data.config)}</Text>
        {data.nextDueDate ? <Text className="text-sm font-sans text-ink" testID="my-payout-next">{t("payouts.next", { date: formatDayMonth(data.nextDueDate) })}</Text> : null}
        {data.pastUnmarkedCount > 0 ? <Text className="text-sm font-sans text-warning-600" testID="my-payout-unmarked">{t("payouts.barber.pastUnmarked", { count: data.pastUnmarkedCount })}</Text> : null}
        <Text accessibilityRole="header" className="pt-2 text-base font-display-semibold text-ink">{t("payouts.history")}</Text>
        {data.payouts.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("payouts.historyEmpty")}</Text> : null}
        {data.payouts.map((p) => (
          <Text key={p.id} className="text-sm font-sans text-ink" testID={`my-payout-row-${p.id}`}>{`${formatDayMonth(p.paidOn)} · ${formatPriceBRL(p.amountCents)}${p.note ? ` · ${p.note}` : ""}`}</Text>
        ))}
      </View>
    </Card>
  );
}
```

Em `app/(barber)/my-profile/compensation.tsx`, importe e renderize `<MyPayoutSection />` logo após o `Card` da remuneração (dentro do `View` de `gap-4`).

- [ ] **Step 3: Rodar**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest && rtk npm run e2e:export && rtk npx playwright test tests/e2e/barber-payouts.web.spec.ts tests/e2e/barber-profile.web.spec.ts`
Expected: PASS (o teste existente do perfil não pode regredir: o mock aborta rotas desconhecidas, então `get_my_payout_summary` ali falha em silêncio e a seção some; se isso quebrar o teste, adicione a rota ao mock desse arquivo devolvendo `null`).

- [ ] **Step 4: Commit**

```bash
git add app src tests
git commit -m "feat: barber payout summary - balance, next date, history"
```

---

### Task 8: Verificação final e PR

- [ ] **Step 1:** `rtk npm run verify`. Corrigir o que falhar.
- [ ] **Step 2:** Verificação visual no navegador, com a pilha local (`running-barberschedule-locally`): criar um barbeiro de comissão com agenda semanal, completar atendimentos, abrir `/payouts`, capturar tela e checar o CSS computado da etiqueta (cor por tom), dos botões e que os cartões ficam com a mesma largura. Abrir `/my-profile/compensation` como o barbeiro e conferir o saldo.
- [ ] **Step 3:** `git push -u origin feat-payouts-02-payouts` (branch criada a partir de `feat-payouts-01-commission-history`) e abrir PR com base `feat-payouts-01-commission-history`; `bind_pr` + `set_monitor` (Auto-fix). Sem merge.
