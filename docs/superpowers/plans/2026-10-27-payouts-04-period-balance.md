# Repasses por período e registro de pagamento — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o saldo de cada barbeiro de comissão dividido em remanescente do período anterior e período atual (Receita e Repasses) e trocar o formulário em linha por um pop-up "Registrar pagamento".

**Architecture:** `get_payout_overview` ganha `period_start`, `prior_open_cents` e `current_open_cents` (a conta total não muda). O app só renderiza: `periodLines` (puro) decide as linhas, `PeriodBreakdown` as desenha na Receita, no cartão e no pop-up `PayoutSheet`. O selo de situação e o lembrete do dono passam a olhar só o remanescente.

**Tech Stack:** Postgres (pgTAP, plpgsql), Expo/React Native Web, NativeWind (className só em elementos RN simples), TanStack Query, i18next (pt/es/en com chaves tipadas), Jest, Playwright com mocks REST.

**Spec:** `docs/superpowers/specs/2026-10-27-payout-period-balance-design.md`

## Global Constraints

- Período: do vencimento (inclusive) até a véspera do próximo; o dia do repasse abre o período novo.
- Remanescente = `max(0, ganho antes de L − pago total)`, `L` = último vencimento até hoje (hoje conta). Atual = saldo total − remanescente (pode ser negativo → "Pago a mais").
- Situação só pelo remanescente: sem agenda `no_schedule`; remanescente 0 `ok`; `L` = hoje `due_today`; `L` < hoje `pending`.
- Lembrete: vence hoje e remanescente de hoje > 0; sem o corte "já pagou hoje".
- Textos: "Registrar pagamento", "Salvar registro", "Pagamento registrado."; nota "Anote um pagamento que você já fez. O app não envia dinheiro."; "Remanescente do período anterior"; "Período atual · até dd/mm" (véspera do próximo vencimento). Nada de "Pagar".
- Remover "Contando desde" e "Saldo a repassar (acumulado)" da Receita.
- Cores só tokens existentes: `text-danger-500`, `text-success-500`, `text-warning-500`, `text-ink`, `text-neutral-*`. Datas com `DateInput`; todo `<Input>` com `placeholder`. Chaves i18n sem número (use `d0..d6`).
- Códigos de erro de repasse: P0039/P0040 (já existem). Migration nova: `0063`.
- TDD estrito; verificar a UI no navegador (captura de tela e CSS computado); commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Verificação local: `.env.local` é movido durante `e2e:export` e restaurado; e2e roda com `playwright.chrome.config.ts` (Chrome do sistema, não commitado).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0063_payout_period_balance.sql` (novo) | funções auxiliares, `get_payout_overview` nova, `payout_due_barbers` nova |
| `supabase/tests/045_period_balance.sql` (novo) | pgTAP do período |
| `supabase/tests/043_barber_payouts.sql`, `044_payout_notifications.sql` | ajuste de 1 e 3 asserts |
| `src/features/payouts/types.ts`, `api.ts` | campos novos do overview |
| `src/features/payouts/balance.ts` | `periodLines` |
| `src/features/payouts/owner/PeriodBreakdown.tsx` (novo) | linhas remanescente/atual |
| `src/features/payouts/owner/PayoutSheet.tsx` (novo) | pop-up de registro |
| `src/features/payouts/owner/PayoutCard.tsx` | saldo total + linhas + botão novo |
| `src/features/payouts/owner/PayoutForm.tsx` | removido (vira `PayoutSheet`) |
| `app/(owner)/payouts.tsx`, `app/(owner)/revenue.tsx` | usam os componentes novos |
| `src/i18n/locales/{pt,es,en}.ts` | textos |
| `tests/unit/payout-balance.test.ts`, `tests/integration/payouts.test.ts`, `tests/e2e/owner-payouts.web.spec.ts`, `tests/e2e/owner-revenue.web.spec.ts` | testes |

---

### Task 1: Banco — período, situação e lembrete

**Files:**
- Create: `supabase/tests/045_period_balance.sql`, `supabase/migrations/0063_payout_period_balance.sql`
- Modify: `supabase/tests/043_barber_payouts.sql` (assert da situação após pagamento parcial), `supabase/tests/044_payout_notifications.sql` (A é paga por inteiro)

**Interfaces:**
- Produces: `payout_earned_between_cents(uuid, date, date, text) → integer`; `payout_prior_open_cents(uuid, date, date, text) → integer`; `get_payout_overview()` com as colunas antigas mais `period_start date, prior_open_cents integer, current_open_cents integer`.

- [ ] **Step 1: Escrever o teste pgTAP novo**

Crie `supabase/tests/045_period_balance.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values ('00000000-0000-0000-0000-000000000000', 'b2000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't45-owner@example.com', 'x', now());
update public.profiles set role = 'owner' where user_id = 'b2000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b2100000-0000-0000-0000-000000000001', 'T45 Shop', 'b2000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- A: weekly, last due date 3 days ago (L = today - 3).   C: 40%, no schedule.
-- D: weekly, due today.   E: weekly, tracking started yesterday, first due date still ahead.
-- F: monthly on the day of the month of 3 days ago.
insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, payout_schedule, payout_day_1, payout_tracking_start)
values
  ('b2200000-0000-0000-0000-00000000000a', 'b2100000-0000-0000-0000-000000000001', null, 'Barber A', 'commission', 50, 'weekly', extract(dow from pg_temp.today() - 3)::smallint, pg_temp.today() - 20),
  ('b2200000-0000-0000-0000-00000000000c', 'b2100000-0000-0000-0000-000000000001', null, 'Barber C', 'commission', 40, 'none', null, pg_temp.today() - 20),
  ('b2200000-0000-0000-0000-00000000000d', 'b2100000-0000-0000-0000-000000000001', null, 'Barber D', 'commission', 50, 'weekly', extract(dow from pg_temp.today())::smallint, pg_temp.today() - 20),
  ('b2200000-0000-0000-0000-00000000000e', 'b2100000-0000-0000-0000-000000000001', null, 'Barber E', 'commission', 50, 'weekly', extract(dow from pg_temp.today() - 3)::smallint, pg_temp.today() - 1),
  ('b2200000-0000-0000-0000-00000000000f', 'b2100000-0000-0000-0000-000000000001', null, 'Barber F', 'commission', 50, 'monthly', extract(day from pg_temp.today() - 3)::smallint, pg_temp.today() - 20);

insert into public.customers (id, shop_id, full_name, email)
values ('b2300000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'T45 Customer', 't45-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b2400000-0000-0000-0000-000000000001', 'b2100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
select gen_random_uuid(), 'b2100000-0000-0000-0000-000000000001', b.id, 'b2400000-0000-0000-0000-000000000001'
from public.barbers b where b.shop_id = 'b2100000-0000-0000-0000-000000000001';

-- One completed 100,00 cut `back` days ago at 12:00 shop time.
create function pg_temp.appt(who uuid, back integer) returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'b2100000-0000-0000-0000-000000000001', who, 'b2300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
    ((pg_temp.today() - back)::timestamp + interval '12 hours') at time zone 'America/Sao_Paulo',
    ((pg_temp.today() - back)::timestamp + interval '12 hours 30 minutes') at time zone 'America/Sao_Paulo',
    ((pg_temp.today() - back)::timestamp + interval '12 hours 30 minutes') at time zone 'America/Sao_Paulo',
    'completed', 'Cut', 30, 10000, 0
  from public.barber_services bs where bs.barber_id = who
$$;

-- A: two cuts before L (2 x 5000 = 10000) and two after (10000). C: 4000. D: one before today, one today.
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 10);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 5);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 2);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000a', 0);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000c', 2);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000d', 10);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000d', 0);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000e', 1);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000f', 5);
select pg_temp.appt('b2200000-0000-0000-0000-00000000000f', 2);

create function pg_temp.split(who uuid) returns text language sql as $$
  select (prior_open_cents, current_open_cents)::text from public.get_payout_overview() where barber_id = who
$$;
create function pg_temp.status_of(who uuid) returns text language sql as $$
  select status from public.get_payout_overview() where barber_id = who
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);

-- A: what was earned before the last due date is "previous period", the rest is the current one.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(10000,10000)', 'A: previous period and current period are split at the last due date');
select is((select period_start from public.get_payout_overview() where barber_id = 'b2200000-0000-0000-0000-00000000000a'), pg_temp.today() - 3, 'A: the current period started on the due date');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000a'), 'pending', 'A: an unpaid previous period past its due date is pending');

select is((select amount_cents from public.record_barber_payout('b2200000-0000-0000-0000-00000000000a', 4000, pg_temp.today(), null)), 4000, 'the owner records a partial payment');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(6000,10000)', 'A: a partial payment reduces the oldest (previous) period first');

select lives_ok($$ select * from public.record_barber_payout('b2200000-0000-0000-0000-00000000000a', 6000, pg_temp.today(), null) $$, 'the owner pays the rest of the previous period');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(0,10000)', 'A: once the previous period is paid only the current one remains');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000a'), 'ok', 'A: nothing left from the previous period is ok');

select lives_ok($$ select * from public.record_barber_payout('b2200000-0000-0000-0000-00000000000a', 12000, pg_temp.today(), null) $$, 'paying beyond what was earned is allowed');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000a'), '(0,-2000)', 'A: the surplus makes the current period negative (overpaid)');

-- C: no schedule has no periods.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000c'), '(0,4000)', 'C: without a schedule everything is the current balance');
select is((select period_start from public.get_payout_overview() where barber_id = 'b2200000-0000-0000-0000-00000000000c'), null, 'C: and there is no period start');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000c'), 'no_schedule', 'C: status stays no_schedule');

-- D: due today, the period that closes today is the previous one (today opens a new period).
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000d'), '(5000,5000)', 'D: on the due date the closed period is owed and today already counts in the new one');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000d'), 'due_today', 'D: due today while the previous period is open');

reset role;
select is(
  array(select barber_name from public.payout_due_barbers('b2100000-0000-0000-0000-000000000001', pg_temp.today()) order by 1),
  array['Barber D'], 'only D is a reminder candidate today: it owes a closed period'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);

select lives_ok($$ select * from public.record_barber_payout('b2200000-0000-0000-0000-00000000000d', 5000, pg_temp.today(), null) $$, 'the owner pays D''s closed period in full');
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000d'), '(0,5000)', 'D: the new period starts counting after the full payment');
select is(pg_temp.status_of('b2200000-0000-0000-0000-00000000000d'), 'ok', 'D: and the due flag clears');

-- E: before the first due date everything is the current period.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000e'), '(0,5000)', 'E: before the first due date there is no previous period');

-- F: monthly follows the same rule.
select is(pg_temp.split('b2200000-0000-0000-0000-00000000000f'), '(5000,5000)', 'F: a monthly schedule splits at its last due date');

select * from finish();
rollback;
```

Contagem: 21 asserts (3 + 2 + 2 + 2 + 3 + 2 + 1 + 3 + 1 + 1 + 1 = confira com `plan`); ajuste `plan(N)` ao número real que o pgTAP reportar.

- [ ] **Step 2: Aplicar o ajuste mínimo em 043 e 044**

Em `supabase/tests/043_barber_payouts.sql`, trocar a linha do assert após o pagamento parcial:

```sql
select is((select status from public.get_payout_overview() where barber_id = 'b0200000-0000-0000-0000-000000000001'), 'pending', 'a partial payout leaves the remainder of the previous period pending');
```

(no lugar de `... 'ok', 'a payout after the last due date clears the pending flag'`).

Em `supabase/tests/044_payout_notifications.sql`, o pagamento de A passa a ser integral (A ganhou 5000): trocar `1000` por `5000` na inserção `record_barber_payout('b1200000-0000-0000-0000-000000000001', 1000, ...)` e na mensagem (`'the owner pays A in full'`), em `(params ->> 'amount_cents')::int ... 1000, 'A is told about the payout'` e em `where amount_cents = 1000` do `delete_barber_payout`. Executar:

```bash
python3 - <<'EOF'
p = "supabase/tests/044_payout_notifications.sql"
s = open(p).read()
s = s.replace("record_barber_payout('b1200000-0000-0000-0000-000000000001', 1000, pg_temp.today())), 1000, 'the owner pays A')", "record_barber_payout('b1200000-0000-0000-0000-000000000001', 5000, pg_temp.today())), 5000, 'the owner pays A in full')")
s = s.replace("  1000, 'A is told about the payout'", "  5000, 'A is told about the payout'")
s = s.replace("where amount_cents = 1000))", "where amount_cents = 5000))")
s = s.replace("'a barber already paid today is no longer due'", "'a barber paid in full today is no longer due'")
open(p, "w").write(s)
EOF
git diff --stat supabase/tests
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
npx supabase test db 2>&1 | tail -30
```
Esperado: 045 falha (`column "prior_open_cents" does not exist`), 043 falha no assert alterado (`'ok'` vs `'pending'`) e 044 falha no "no longer due" (com a regra antiga o saldo restante mantém A ou o pagamento inteiro já a zera: a falha exata importa menos; ao menos 045 e 043 precisam falhar). Falhas pré-existentes 010/012/031 são esperadas.

- [ ] **Step 4: Escrever a migration**

Crie `supabase/migrations/0063_payout_period_balance.sql`:

```sql
-- Period split of the payout balance and a status/reminder that only look at the previous period.

create function public.payout_earned_between_cents(target_barber uuid, from_date date, before_date date, tz text)
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
    and a.starts_at >= from_date::timestamp at time zone tz
    and a.starts_at < before_date::timestamp at time zone tz;
$$;

-- What is still owed from before `boundary` (the last due date): earned before it minus everything paid, never below zero.
create function public.payout_prior_open_cents(target_barber uuid, from_date date, boundary date, tz text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select case
    when boundary is null then 0
    else greatest(public.payout_earned_between_cents(target_barber, from_date, boundary, tz) - public.payout_paid_cents(target_barber, from_date), 0)
  end;
$$;

revoke all on function public.payout_earned_between_cents(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.payout_prior_open_cents(uuid, date, date, text) from public, anon, authenticated;

drop function public.get_payout_overview();

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
  status text,
  period_start date,
  prior_open_cents integer,
  current_open_cents integer
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
  ), split as (
    select d.*, public.payout_prior_open_cents(d.id, d.start_date, d.last_due, sh.timezone) as prior_open
    from due d
  )
  select
    s.id,
    s.name,
    s.payout_schedule,
    s.payout_day_1,
    s.payout_day_2,
    s.start_date,
    s.earned,
    s.paid,
    s.earned - s.paid,
    s.last_due,
    s.next_due,
    case
      when s.payout_schedule = 'none' then 'no_schedule'
      when s.prior_open = 0 then 'ok'
      when s.last_due = today then 'due_today'
      else 'pending'
    end,
    case when s.payout_schedule = 'none' then null else coalesce(s.last_due, s.start_date) end,
    s.prior_open,
    s.earned - s.paid - s.prior_open
  from split s
  where s.active or s.earned - s.paid <> 0
  order by s.name;
end;
$$;

revoke all on function public.get_payout_overview() from public, anon;
grant execute on function public.get_payout_overview() to authenticated;

-- Reminder candidates: due today and something from the period that just closed is still unpaid.
create or replace function public.payout_due_barbers(target_shop uuid, local_date date)
returns table (barber_id uuid, barber_name text)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select b.id, b.name
  from public.barbers b
  join public.shops s on s.id = b.shop_id
  where b.shop_id = target_shop
    and b.active
    and b.compensation_type = 'commission'
    and b.payout_schedule <> 'none'
    and b.payout_tracking_start <= local_date
    and exists (select 1 from public.payout_due_dates(b.payout_schedule, b.payout_day_1, b.payout_day_2, local_date, local_date))
    and public.payout_prior_open_cents(b.id, b.payout_tracking_start, local_date, s.timezone) > 0
  order by b.name;
$$;
revoke all on function public.payout_due_barbers(uuid, date) from public, anon, authenticated;
```

- [ ] **Step 5: Aplicar e rodar os testes**

```bash
npx supabase migration up 2>&1 | tail -3
npx supabase test db 2>&1 | tail -25
```
Esperado: 043, 044 e 045 passam; falhas só nas pré-existentes 010/012/031. Se `plan(21)` divergir do número real de asserts, corrija o `plan(N)` para o número que o pgTAP informa (não altere asserts).

- [ ] **Step 6: Commit**

```bash
git add supabase docs/superpowers/plans/2026-10-27-payouts-04-period-balance.md
git commit -m "feat: payout balance split by period; status and reminder use the previous period

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Camada de domínio — tipos, API e `periodLines`

**Files:**
- Modify: `src/features/payouts/types.ts`, `src/features/payouts/api.ts`, `src/features/payouts/balance.ts`, `tests/unit/payout-balance.test.ts`, `tests/integration/payouts.test.ts`

**Interfaces:**
- Consumes: colunas do Task 1.
- Produces: `PayoutOverviewItem.periodStart: string | null`, `.priorOpenCents: number`, `.currentOpenCents: number`; `periodLines(item, { withTotal }): PeriodRow[]` com `PeriodRow = { cents: number; endsOn?: string | null; key: "current" | "overpaid" | "prior" | "total" }`.

- [ ] **Step 1: Teste unitário de `periodLines` (falha)**

Acrescente ao final de `tests/unit/payout-balance.test.ts` (e `periodLines` ao import de `balance`):

```ts
import { periodLines } from "../../src/features/payouts/balance";
import type { PayoutOverviewItem } from "../../src/features/payouts/types";

const item = (patch: Partial<PayoutOverviewItem>): PayoutOverviewItem => ({
  balanceCents: 0, barberId: "b1", barberName: "Ana", config: { day1: 5, day2: null, schedule: "weekly" }, currentOpenCents: 0, earnedCents: 0,
  lastDueDate: null, nextDueDate: "2026-11-06", paidCents: 0, periodStart: "2026-10-30", priorOpenCents: 0, status: "ok", trackingStart: "2026-10-01", ...patch,
});

describe("periodLines", () => {
  it("shows previous and current period with a total when something is left from before", () => {
    const rows = periodLines(item({ balanceCents: 12000, currentOpenCents: 4000, priorOpenCents: 8000 }), { withTotal: true });

    expect(rows).toEqual([{ cents: 12000, key: "total" }, { cents: 8000, key: "prior" }, { cents: 4000, endsOn: "2026-11-05", key: "current" }]);
  });

  it("drops the total row when asked", () => {
    const rows = periodLines(item({ balanceCents: 12000, currentOpenCents: 4000, priorOpenCents: 8000 }), { withTotal: false });

    expect(rows.map((r) => r.key)).toEqual(["prior", "current"]);
  });

  it("shows only the current period, ending the day before the next due date, when nothing is left from before", () => {
    expect(periodLines(item({ balanceCents: 4000, currentOpenCents: 4000 }), { withTotal: true })).toEqual([{ cents: 4000, endsOn: "2026-11-05", key: "current" }]);
  });

  it("has no end date when there is no next due date", () => {
    expect(periodLines(item({ balanceCents: 4000, currentOpenCents: 4000, nextDueDate: null }), { withTotal: true })).toEqual([{ cents: 4000, endsOn: null, key: "current" }]);
  });

  it("shows overpaid as a positive amount", () => {
    expect(periodLines(item({ balanceCents: -2500, currentOpenCents: -2500 }), { withTotal: true })).toEqual([{ cents: 2500, key: "overpaid" }]);
    expect(periodLines(item({ balanceCents: -2500, currentOpenCents: -2500 }), { withTotal: false })).toEqual([]);
  });

  it("without a schedule there is just the total", () => {
    const base = item({ balanceCents: 1500, config: { day1: null, day2: null, schedule: "none" }, currentOpenCents: 1500, nextDueDate: null, periodStart: null });

    expect(periodLines(base, { withTotal: true })).toEqual([{ cents: 1500, key: "total" }]);
    expect(periodLines(base, { withTotal: false })).toEqual([]);
  });
});
```

Rodar: `npx jest tests/unit/payout-balance.test.ts` → FAIL (`periodLines is not a function`, e erros de tipo nos campos novos).

- [ ] **Step 2: Tipos e API**

Em `src/features/payouts/types.ts`: em `PayoutOverviewItem` acrescente `currentOpenCents: number;`, `periodStart: string | null;`, `priorOpenCents: number;` (ordem alfabética, como o resto); em `OverviewRow` acrescente `current_open_cents: number; period_start: string | null; prior_open_cents: number;`.

Em `src/features/payouts/api.ts`, no `map` de `getPayoutOverview`, acrescente:

```ts
    currentOpenCents: row.current_open_cents,
    periodStart: row.period_start,
    priorOpenCents: row.prior_open_cents,
```
(entre `config` e `earnedCents` mantém a ordem alfabética: `currentOpenCents` depois de `config`; `periodStart` e `priorOpenCents` depois de `paidCents`).

- [ ] **Step 3: `periodLines`**

Em `src/features/payouts/balance.ts` acrescente:

```ts
import { addLocalDays } from "../../lib/dates/calendar-strip-days";
import type { PayoutOverviewItem } from "./types";

export type PeriodRow = { cents: number; endsOn?: string | null; key: "current" | "overpaid" | "prior" | "total" };

// The rows to show for a barber's balance. The current period ends the day before the next due date; the due date opens a new one.
export function periodLines(
  item: Pick<PayoutOverviewItem, "balanceCents" | "config" | "currentOpenCents" | "nextDueDate" | "priorOpenCents">,
  { withTotal }: { withTotal: boolean },
): PeriodRow[] {
  const total: PeriodRow = item.balanceCents < 0 ? { cents: -item.balanceCents, key: "overpaid" } : { cents: item.balanceCents, key: "total" };
  const endsOn = item.nextDueDate ? addLocalDays(item.nextDueDate, -1) : null;

  if (item.config.schedule === "none") return withTotal ? [total] : [];
  if (item.priorOpenCents > 0) return [...(withTotal ? [total] : []), { cents: item.priorOpenCents, key: "prior" }, { cents: item.currentOpenCents, endsOn, key: "current" }];
  if (item.balanceCents < 0) return withTotal ? [total] : [];

  return [{ cents: item.currentOpenCents, endsOn, key: "current" }];
}
```
(Se o arquivo já importa `PayoutStatus` de `./types`, junte os imports num só.) Rodar `npx jest tests/unit/payout-balance.test.ts` → PASS.

- [ ] **Step 4: Fixture da integração**

Em `tests/integration/payouts.test.ts`, acrescente à linha de dados do RPC `current_open_cents: 5000, period_start: "2026-10-26", prior_open_cents: 2000` e ao objeto esperado `currentOpenCents: 5000, periodStart: "2026-10-26", priorOpenCents: 2000`. Rodar `npx jest tests/integration/payouts.test.ts` → PASS; `npx tsc --noEmit` → só erros em fixtures de e2e se existirem (e2e não entra no tsc de jest; ignore).

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: overview carries the previous/current period split

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Textos e `PeriodBreakdown`

**Files:**
- Modify: `src/i18n/locales/pt.ts`, `es.ts`, `en.ts`
- Create: `src/features/payouts/owner/PeriodBreakdown.tsx`

**Interfaces:**
- Consumes: `periodLines`, `formatDayMonth`, `formatPriceBRL`.
- Produces: `<PeriodBreakdown item showTotal testIdPrefix />` (cada linha com `testID` `${testIdPrefix}-${row.key}`); chaves `payouts.period.{total,prior,current,currentUntil,overpaid}`, `payouts.sheet.{title,note,open}`.

- [ ] **Step 1: Textos (pt, es, en)**

```bash
python3 - <<'EOF'
import re
T = {
 "pt": dict(pay="Registrar pagamento", save="Salvar registro", rec="Pagamento registrado.",
   period='{ current: "Período atual", currentUntil: "Período atual · até {{date}}", overpaid: "Pago a mais", prior: "Remanescente do período anterior", total: "A receber" }',
   sheet='{ note: "Anote um pagamento que você já fez. O app não envia dinheiro.", open: "Em aberto", title: "Registrar pagamento · {{name}}" }'),
 "es": dict(pay="Registrar pago", save="Guardar registro", rec="Pago registrado.",
   period='{ current: "Período actual", currentUntil: "Período actual · hasta {{date}}", overpaid: "Pagado de más", prior: "Remanente del período anterior", total: "A recibir" }',
   sheet='{ note: "Anota un pago que ya hiciste. La app no envía dinero.", open: "Pendiente", title: "Registrar pago · {{name}}" }'),
 "en": dict(pay="Record payment", save="Save record", rec="Payment recorded.",
   period='{ current: "Current period", currentUntil: "Current period · until {{date}}", overpaid: "Overpaid", prior: "Left from the previous period", total: "To receive" }',
   sheet='{ note: "Log a payment you already made. The app does not send money.", open: "Outstanding", title: "Record payment · {{name}}" }'),
}
for loc, v in T.items():
    p = f"src/i18n/locales/{loc}.ts"
    s = open(p).read()
    a = s.index("  payouts: {")
    b = s.index("  notifications: {", a)
    blk = s[a:b]
    blk = re.sub(r'\n    pay: "[^"]*",', f'\n    pay: "{v["pay"]}",', blk, 1)
    blk = re.sub(r'save: "[^"]*" \},', f'save: "{v["save"]}" }},', blk, 1)
    blk = re.sub(r'\n    recorded: "[^"]*",', f'\n    recorded: "{v["rec"]}",', blk, 1)
    blk = blk.replace("\n    pay: ", f'\n    period: {v["period"]},\n    pay: ', 1)
    blk = blk.replace("\n    title: ", f'\n    sheet: {v["sheet"]},\n    title: ', 1) if "\n    title: " in blk else blk
    s = s[:a] + blk + s[b:]
    open(p, "w").write(s)
EOF
git diff --stat src/i18n; rtk npx tsc --noEmit | tail -3
```
Conferir com `git diff src/i18n/locales/pt.ts`: `pay`, `form.save`, `recorded` trocados e `period`/`sheet` inseridos dentro de `payouts`. Em seguida remover a chave não usada `payoutBalance` de `owner.revenue` nos três idiomas (`sed -i '/^      payoutBalance:/d' src/i18n/locales/{pt,es,en}.ts`) e a `since` NÃO (ela segue usada pela tela do barbeiro).

- [ ] **Step 2: Componente**

Crie `src/features/payouts/owner/PeriodBreakdown.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { formatPriceBRL } from "../../../components/domain/ServiceCard";
import { periodLines } from "../balance";
import { formatDayMonth } from "../format";
import type { PayoutOverviewItem } from "../types";

// The previous/current period lines of a barber's balance. `showTotal` adds the "A receber" line on top.
export function PeriodBreakdown({ item, showTotal, testIdPrefix }: { item: PayoutOverviewItem; showTotal: boolean; testIdPrefix: string }) {
  const { t } = useTranslation();

  return (
    <>
      {periodLines(item, { withTotal: showTotal }).map((row) => {
        const label = row.key === "current" && row.endsOn ? t("payouts.period.currentUntil", { date: formatDayMonth(row.endsOn) }) : t(`payouts.period.${row.key}`);
        const strong = row.key === "total";

        return (
          <View className="flex-row justify-between gap-2" key={row.key}>
            <Text className={`flex-1 text-sm ${strong ? "font-sans-semibold text-ink" : "font-sans text-neutral-600"}`}>{label}</Text>
            <Text className={`text-sm ${strong ? "font-sans-semibold" : "font-sans-medium"} ${row.key === "overpaid" ? "text-warning-500" : "text-ink"}`} testID={`${testIdPrefix}-${row.key}`}>
              {formatPriceBRL(row.cents)}
            </Text>
          </View>
        );
      })}
    </>
  );
}
```
`npx tsc --noEmit` deve passar. (O componente é coberto pelos e2e das Tasks 4 e 5; `periodLines` já tem teste unitário.)

- [ ] **Step 3: Commit**

```bash
npx jest tests/unit 2>&1 | tail -6
git add src
git commit -m "feat: period breakdown component and texts

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
(Jest unit pode acusar testes de paridade de i18n; precisam passar.)

---

### Task 4: Receita — saldo por período

**Files:**
- Modify: `app/(owner)/revenue.tsx`, `tests/e2e/owner-revenue.web.spec.ts`

**Interfaces:**
- Consumes: `PeriodBreakdown`, `getPayoutOverview` (já usado).
- Produces: testIDs `revenue-period-<barberId>-{total,prior,current,overpaid}`, mantém `revenue-payouts-paid-<id>` e `revenue-payouts-link-<id>`; remove `revenue-payouts-balance-<id>` e `revenue-payouts-since-<id>`.

- [ ] **Step 1: Reescrever os dois testes de repasse (falham)**

Em `tests/e2e/owner-revenue.web.spec.ts`, substituir os testes `a commission barber's card shows what was paid out...` e `an overpaid balance stays inside the card...` por:

```ts
const overviewRow = (patch: Record<string, unknown>) => ({
  balance_cents: 0, barber_id: "b1", barber_name: "Ana Barber", current_open_cents: 0, earned_cents: 0, last_due_date: null, next_due_date: null,
  paid_cents: 0, payout_day_1: 5, payout_day_2: null, payout_schedule: "weekly", period_start: "2026-10-30", prior_open_cents: 0, status: "ok", tracking_start: "2026-10-01", ...patch,
});

async function mockRevenueWithPayouts(page: Page, payouts: unknown[], overview: unknown[]) {
  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });

    if (path.endsWith("/rpc/get_current_profile")) return json([{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/rpc/get_shop_report")) return json(report);
    if (path.endsWith("/rpc/list_rent_payments")) return json([]);
    if (path.endsWith("/rpc/list_barber_payouts")) return json(payouts);
    if (path.endsWith("/rpc/get_payout_overview")) return json(overview);
    await route.abort();
  });
}

test("a barber with an unpaid previous period shows the total, the leftover and the current period, linked to Repasses", async ({ page }) => {
  await mockRevenueWithPayouts(
    page,
    [{ amount_cents: 3000, barber_id: "b1", barber_name: "Ana Barber", id: "p1", note: null, paid_on: "2026-10-20" }, { amount_cents: 1000, barber_id: "b1", barber_name: "Ana Barber", id: "p2", note: null, paid_on: "2026-10-25" }],
    [overviewRow({ balance_cents: 7000, current_open_cents: 5000, next_due_date: "2026-11-06", prior_open_cents: 2000 })],
  );

  await page.goto("/revenue");
  const ana = page.getByTestId("barber-row-b1");

  await expect(ana).toContainText("Barber share");
  await expect(page.getByTestId("revenue-payouts-paid-b1")).toContainText("R$ 40,00");
  await expect(page.getByTestId("revenue-period-b1-total")).toContainText("R$ 70,00");
  await expect(page.getByTestId("revenue-period-b1-prior")).toContainText("R$ 20,00");
  await expect(ana).toContainText("Left from the previous period");
  await expect(page.getByTestId("revenue-period-b1-current")).toContainText("R$ 50,00");
  await expect(ana).toContainText("Current period · until 05/11");
  await expect(ana).not.toContainText("Counting since");
  // Chair-rental barbers are paid by the barber, so they get no payout lines.
  await expect(page.getByTestId("revenue-payouts-paid-b2")).toHaveCount(0);

  await page.getByTestId("revenue-payouts-link-b1").click();
  await expect(page).toHaveURL(/\/payouts/);
});

test("with nothing left from before, only the current period shows", async ({ page }) => {
  await mockRevenueWithPayouts(page, [], [overviewRow({ balance_cents: 4400, current_open_cents: 4400, next_due_date: "2026-11-06" })]);

  await page.goto("/revenue");
  await expect(page.getByTestId("revenue-period-b1-current")).toContainText("R$ 44,00");
  await expect(page.getByTestId("revenue-period-b1-prior")).toHaveCount(0);
  await expect(page.getByTestId("revenue-period-b1-total")).toHaveCount(0);
});

test("an overpaid balance stays inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockRevenueWithPayouts(page, [{ amount_cents: 2500, barber_id: "b1", barber_name: "Ana Barber", id: "p1", note: null, paid_on: "2026-10-27" }], [overviewRow({ balance_cents: -2500, current_open_cents: -2500, paid_cents: 2500, tracking_start: "2026-10-27" })]);

  await page.goto("/revenue");
  const card = page.getByTestId("barber-row-b1");
  const overpaid = page.getByTestId("revenue-period-b1-overpaid");

  await expect(overpaid).toContainText("R$ 25,00");
  await expect(card).toContainText("Overpaid");
  const box = (await overpaid.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
});
```
Também: nas fixtures de outros testes deste arquivo que respondem `get_payout_overview`, não há mais nenhuma (as anteriores foram as duas substituídas). Os testes que abortam esse RPC continuam válidos (as linhas só somem).

Rodar o e2e (procedimento da memória) → os três testes novos devem **falhar** (`revenue-period-b1-total` não existe):

```bash
mv .env.local /tmp/env.local.bak && (npm run e2e:export > /tmp/e2e-export.log 2>&1; mv /tmp/env.local.bak .env.local)
(setsid nohup npm run e2e:serve > /tmp/e2e-serve.log 2>&1 < /dev/null &); sleep 3
npx playwright test -c playwright.chrome.config.ts owner-revenue -g "previous period|current period shows|overpaid" 2>&1 | tail -15
```

- [ ] **Step 2: Implementar na Receita**

Em `app/(owner)/revenue.tsx`:
- Remover o import de `formatDayMonth` se ficar sem uso; adicionar `import { PeriodBreakdown } from "../../src/features/payouts/owner/PeriodBreakdown";`.
- Substituir a função `payoutBalanceLine` inteira por:

```tsx
  const payoutLines = (barberId: string) => {
    const item = payoutOverview.data?.find((o) => o.barberId === barberId);

    if (!item) return null;

    return (
      <>
        <PeriodBreakdown item={item} showTotal testIdPrefix={`revenue-period-${barberId}`} />
        <Button label={t("owner.revenue.viewPayouts")} onPress={() => router.push("/payouts" as never)} size="sm" testID={`revenue-payouts-link-${barberId}`} variant="outline" />
      </>
    );
  };
```
- Trocar `payoutBalanceLine(row.barberId)` por `payoutLines(row.barberId)` no cartão.

- [ ] **Step 3: Rebuild e rodar verde**

```bash
kill $(ss -ltnp | grep :4173 | grep -o 'pid=[0-9]*' | cut -d= -f2); rm -rf .e2e-dist
mv .env.local /tmp/env.local.bak && (npm run e2e:export > /tmp/e2e-export.log 2>&1; mv /tmp/env.local.bak .env.local)
(setsid nohup npm run e2e:serve > /tmp/e2e-serve.log 2>&1 < /dev/null &); sleep 3
npx playwright test -c playwright.chrome.config.ts owner-revenue 2>&1 | tail -15
```
Esperado: todos os testes de `owner-revenue` passam.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit | tail -2
git add app tests
git commit -m "feat: revenue cards show the previous and current period

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Repasses — cartão com saldo e pop-up "Registrar pagamento"

**Files:**
- Create: `src/features/payouts/owner/PayoutSheet.tsx`
- Modify: `src/features/payouts/owner/PayoutCard.tsx`, `app/(owner)/payouts.tsx`, `tests/e2e/owner-payouts.web.spec.ts`
- Delete: `src/features/payouts/owner/PayoutForm.tsx`

**Interfaces:**
- Consumes: `PeriodBreakdown`, `parseReaisToCents`/`centsToReaisInput` (`src/lib/money`), `recordBarberPayout` (mutação existente).
- Produces: `<PayoutSheet item busy onClose onSubmit today />` (`item: PayoutOverviewItem | null`; `onSubmit({ amountCents, note, paidOn })`); testIDs `payout-sheet`, `payout-sheet-backdrop`, `payout-sheet-period-{total,prior,current,overpaid}`, e os de antes `payout-amount`, `payout-date`, `payout-note`, `payout-submit`.

- [ ] **Step 1: Atualizar o e2e dos Repasses (falha)**

Em `tests/e2e/owner-payouts.web.spec.ts`:
- Na constante `overview`, acrescentar a `b1` `current_open_cents: 5000, period_start: "2026-10-26", prior_open_cents: 2000` e a `b2` `current_open_cents: 1500, period_start: null, prior_open_cents: 0`.
- Substituir o teste `paying starts filled with the balance and records the payout` por:

```ts
test("registering a payment opens a pop-up with what is open, filled with the total", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");

  // The card itself shows what the barber should receive, split in the two periods.
  await expect(page.getByTestId("payout-card-b1")).toContainText("R$ 70,00");
  await expect(page.getByTestId("payout-period-b1-prior")).toContainText("R$ 20,00");
  await expect(page.getByTestId("payout-period-b1-current")).toContainText("R$ 50,00");
  await expect(page.getByTestId("payout-pay-b1")).toContainText("Record payment");

  await page.getByTestId("payout-pay-b1").click();
  await expect(page.getByTestId("payout-sheet")).toContainText("Record payment · Ana Barber");
  await expect(page.getByTestId("payout-sheet")).toContainText("The app does not send money");
  await expect(page.getByTestId("payout-sheet-period-total")).toContainText("R$ 70,00");
  await expect(page.getByTestId("payout-sheet-period-prior")).toContainText("R$ 20,00");
  // The background is dimmed behind the sheet.
  await expect(page.getByTestId("payout-sheet-backdrop")).toHaveCSS("background-color", "rgba(0, 0, 0, 0.4)");

  await expect(page.getByTestId("payout-amount")).toHaveValue("70,00");
  await page.getByTestId("payout-amount").fill("20");
  await page.getByTestId("payout-note").fill("Semana 1");
  await page.getByTestId("payout-submit").click();

  await expect.poll(() => calls.payout).toMatchObject({ payout_amount_cents: 2000, payout_note: "Semana 1", target_barber_id: "b1" });
  await expect(page.getByTestId("payout-sheet")).toHaveCount(0);
});

test("cancelling the pop-up records nothing", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/payouts");
  await page.getByTestId("payout-pay-b1").click();
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByTestId("payout-sheet")).toHaveCount(0);
  expect(calls.payout).toBeUndefined();
});
```
- No teste `a one-off payout works for a barber without a schedule`, acrescentar antes do `fill`: `await expect(page.getByTestId("payout-period-b2-current")).toHaveCount(0);` (sem agenda não há linhas de período) e manter o resto.

Rodar → falha (`payout-sheet` não existe). Para rodar este teste precisa do bundle novo; faça o rebuild do Step 4 depois de implementar e use aqui só a leitura do erro esperado se quiser ver vermelho antes (opcional: reusar o bundle da Task 4 mostra vermelho).

- [ ] **Step 2: `PayoutSheet`**

Crie `src/features/payouts/owner/PayoutSheet.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { DateInput } from "../../../components/ui/MaskedInputs";
import { centsToReaisInput, parseReaisToCents } from "../../../lib/money";
import type { PayoutOverviewItem } from "../types";
import { PeriodBreakdown } from "./PeriodBreakdown";

type Props = {
  busy: boolean;
  item: PayoutOverviewItem | null;
  onClose: () => void;
  onSubmit: (input: { amountCents: number; note: string; paidOn: string }) => void;
  today: string;
};

// Pop-up over the list (like the agenda's booking sheet): what is open for the barber, then amount, date and note of a payment already made.
export function PayoutSheet({ busy, item, onClose, onSubmit, today }: Props) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const barberId = item?.barberId;

  useEffect(() => {
    if (!item) return;
    setAmount(item.balanceCents > 0 ? centsToReaisInput(item.balanceCents) : "");
    setPaidOn(today);
    setNote("");
    setError(null);
    // Reset only when a different barber is opened; a background refetch must not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId, today]);

  if (!item) return null;

  const submit = () => {
    const amountCents = parseReaisToCents(amount);

    if (amountCents === null) return setError(t("errors.codes.PAYOUT_INVALID"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setError(t("payouts.form.dateInvalid"));
    setError(null);
    onSubmit({ amountCents, note, paidOn });
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/40" testID="payout-sheet-backdrop">
        <View className="max-h-[90%] w-full rounded-t-2xl bg-surface" testID="payout-sheet">
          <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled">
            <View className="items-center p-5">
              <View className="w-full max-w-[420px] gap-3">
                <Text accessibilityRole="header" className="text-2xl font-display-bold text-ink">{t("payouts.sheet.title", { name: item.barberName })}</Text>
                <Text className="text-sm font-sans text-neutral-600">{t("payouts.sheet.note")}</Text>
                <View className="gap-1 rounded-xl border border-neutral-300 p-3">
                  <Text className="text-xs font-sans-medium text-neutral-500">{t("payouts.sheet.open")}</Text>
                  <PeriodBreakdown item={item} showTotal testIdPrefix="payout-sheet-period" />
                </View>
                <Input keyboardType="numeric" label={t("payouts.form.amount")} onChangeText={setAmount} placeholder={t("examples.money")} testID="payout-amount" value={amount} />
                <DateInput label={t("payouts.form.date")} onChangeValue={setPaidOn} testID="payout-date" value={paidOn} />
                <Input label={t("payouts.form.note")} onChangeText={setNote} placeholder={t("examples.payoutNote")} testID="payout-note" value={note} />
                {error ? <Text className="text-sm font-sans text-danger-500">{error}</Text> : null}
                <View className="flex-row gap-2">
                  <Button disabled={busy} label={t("payouts.form.save")} onPress={submit} size="sm" testID="payout-submit" />
                  <Button label={t("common.cancel")} onPress={onClose} size="sm" variant="outline" />
                </View>
              </View>
            </View>
          </KeyboardAwareScrollView>
        </View>
      </View>
    </Modal>
  );
}
```
Se o lint reclamar da diretiva `eslint-disable-next-line react-hooks/exhaustive-deps` (regra não ativa), remova só a diretiva.

- [ ] **Step 3: `PayoutCard`, `payouts.tsx`, remover `PayoutForm`**

`src/features/payouts/owner/PayoutCard.tsx`: importar `PeriodBreakdown`, acrescentar uma legenda acima do número grande e as linhas abaixo dele:

```tsx
        <View>
          <Text className="text-xs font-sans text-neutral-500">{t("payouts.period.total")}</Text>
          <Text className="text-2xl font-display-bold text-ink" testID={`payout-total-${item.barberId}`}>
            {item.balanceCents < 0 ? `${t("payouts.balanceOverpaid")} ${formatPriceBRL(-item.balanceCents)}` : formatPriceBRL(item.balanceCents)}
          </Text>
        </View>
        <PeriodBreakdown item={item} showTotal={false} testIdPrefix={`payout-period-${item.barberId}`} />
```
(substitui o `<Text className="text-2xl ...">` atual; o botão continua com `t("payouts.pay")`, que agora vale "Registrar pagamento".)

`app/(owner)/payouts.tsx`:
- Trocar `payingId`/`PayoutForm`/`Card` por `const [paying, setPaying] = useState<PayoutOverviewItem | null>(null);`.
- `onPay={() => setPaying(item)}`; remover o bloco `{payingId === ... ? <Card>...}`; o `View key` deixa de precisar de `gap-2` (pode virar só `<PayoutCard key=... />`).
- Após a lista, antes do histórico, renderizar:

```tsx
            <PayoutSheet busy={record.isPending} item={paying} onClose={() => setPaying(null)} onSubmit={(input) => paying && record.mutate({ ...input, barberId: paying.barberId })} today={today} />
```
- No `onSuccess` da mutação: `setPaying(null)`.
- Imports: tirar `Card`, `PayoutForm`; adicionar `PayoutSheet` e `type PayoutOverviewItem`.
- `git rm src/features/payouts/owner/PayoutForm.tsx`.

- [ ] **Step 4: Verde, tipos e lint**

```bash
npx tsc --noEmit | tail -3
npm run lint 2>&1 | tail -5
kill $(ss -ltnp | grep :4173 | grep -o 'pid=[0-9]*' | cut -d= -f2); rm -rf .e2e-dist
mv .env.local /tmp/env.local.bak && (npm run e2e:export > /tmp/e2e-export.log 2>&1; mv /tmp/env.local.bak .env.local)
(setsid nohup npm run e2e:serve > /tmp/e2e-serve.log 2>&1 < /dev/null &); sleep 3
npx playwright test -c playwright.chrome.config.ts owner-payouts owner-revenue barber-payouts owner-barbers 2>&1 | tail -25
```
Esperado: tudo passa.

- [ ] **Step 5: Commit**

```bash
git add -A src app tests
git commit -m "feat: payouts card shows the balance by period; register payment in a pop-up

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verificação visual, suíte completa e PR #87

**Files:** nenhum arquivo de produto; arquivos temporários só em `tests/e2e/zz-shot.web.spec.ts` (apagar) e no scratchpad.

- [ ] **Step 1: Captura de tela e CSS computado**

Spec temporário `tests/e2e/zz-shot.web.spec.ts` (copiar `signInAsOwner` e `ownerId` do topo de `owner-payouts.web.spec.ts`) que abre `/payouts` com o overview do e2e (b1 com remanescente), tira captura do cartão, abre o pop-up e tira captura inteira; imprimir `getComputedStyle` do fundo (`rgba(0, 0, 0, 0.4)`), da cor de `payout-sheet-period-prior` (`rgb(23, 20, 18)`) e do botão "Salvar registro". Repetir para `/revenue` com um barbeiro com remanescente e um quitado. Conferir as imagens (Read) e apagar o spec:

```bash
npx playwright test -c playwright.chrome.config.ts zz-shot 2>&1 | tail -6
rm tests/e2e/zz-shot.web.spec.ts
```

- [ ] **Step 2: Suíte completa e limpeza**

```bash
kill $(ss -ltnp | grep :4173 | grep -o 'pid=[0-9]*' | cut -d= -f2); rm -rf .e2e-dist test-results playwright-report
npx tsc --noEmit | tail -2; npm run lint 2>&1 | tail -3; npx jest 2>&1 | grep -E "^Tests:|^Test Suites:"; npx supabase test db 2>&1 | tail -12; git status --short
```
Esperado: tsc e lint limpos, jest verde, pgTAP só com as falhas pré-existentes (010/012/031), árvore limpa.

- [ ] **Step 3: Corrigir o dado de dev do Barber Teste (informar, não alterar sozinho)**

Apenas relatar ao usuário como o saldo do Barber Teste aparece agora (remanescente/período atual) a partir de `psql` somente leitura; não alterar dados dele.

- [ ] **Step 4: Push, PR #87 em cima do #86, Auto-fix, memória**

```bash
git push -q -u origin feat-payouts-05-period-balance
gh api repos/:owner/:repo/pulls -f title="feat: payout balance by period + register-payment sheet (5/5)" -f head=feat-payouts-05-period-balance -f base=feat-payouts-04-revenue-link -f body="<corpo: o que mudou (regra sexta a quinta, remanescente/período atual, pop-up Registrar pagamento, selo e lembrete pelo remanescente), testes, e que empilha em #86>

🤖 Generated with [Claude Code](https://claude.com/claude-code)" --jq '.html_url'
```
Depois: `mcp__ccd_pr__get_status` (se não vinculado, `bind_pr`), `mcp__ccd_pr__set_monitor` com `auto_fix: true` e a URL do PR; atualizar `project_payouts.md` e a linha do `MEMORY.md` com o PR #87 (regra: período de vencimento a véspera do próximo; selo/lembrete pelo remanescente; pop-up).
