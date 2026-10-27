# Histórico de comissão — plano de implementação (PR1 de 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada atendimento passa a usar o percentual de comissão vigente na sua data, e o dono escolhe ao mudar o percentual entre "só daqui para frente" e "também nos anteriores".

**Architecture:** Tabela `barber_commission_rates` (percentual + `effective_from`), função `commission_percent_at(barbeiro, instante)` e os dois relatórios que calculam comissão passam a somar por atendimento. `set_barber_compensation` ganha `apply_retroactively`. No app, `CompensationEditor` abre um `ConfirmDialog` de três saídas quando o percentual muda.

**Tech Stack:** Postgres/Supabase (pgTAP), TypeScript, Expo Router, React Native + NativeWind, i18next (pt/es/en), Jest, Playwright (mock de REST).

**Spec:** `docs/superpowers/specs/2026-10-27-barber-payouts-design.md` (seção "PR1").

## Global Constraints

- Migração nova: `supabase/migrations/0060_commission_rate_history.sql`. Nunca editar migrações antigas.
- Funções `security definer` usam `set search_path = pg_catalog, public, pg_temp` e `revoke all ... from public, anon` + `grant execute ... to authenticated` quando expostas.
- Tabela nova: RLS ligada e `revoke all ... from public, anon, authenticated`.
- Retroativo apaga o histórico do barbeiro e deixa uma linha única em `'epoch'`. Não há desfazer.
- Percentual igual ao atual não toca o histórico.
- Textos do app em pt, es e en; os três arquivos têm as mesmas chaves.
- Em React Native Web, `className` só em elementos RN simples; não usar `Alert.alert` (use `ConfirmDialog`).
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Comandos de leitura de saída longa levam o prefixo `rtk`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0060_commission_rate_history.sql` | tabela, função `commission_percent_at`, nova `set_barber_compensation`, relatórios por atendimento |
| `supabase/tests/042_commission_history.sql` | pgTAP do histórico e dos relatórios |
| `src/features/barbers/commission-change.ts` | regra pura: quando perguntar |
| `src/features/barbers/api.ts` | `setBarberCompensation` envia `apply_retroactively` |
| `src/components/domain/ConfirmDialog.tsx` | ação alternativa opcional e variante do botão |
| `src/features/barbers/owner/CompensationEditor.tsx` | fluxo do diálogo |
| `src/i18n/locales/{pt,es,en}.ts` | textos do diálogo |
| `tests/unit/commission-change.test.ts`, `tests/unit/confirm-dialog.test.ts` | regra e diálogo |
| `tests/integration/barber-side.test.ts`, `tests/e2e/owner-barbers.web.spec.ts` | payload e fluxo |

---

### Task 1: Testes SQL do histórico (falham primeiro)

**Files:**
- Create: `supabase/tests/042_commission_history.sql`

**Interfaces:**
- Consumes: `set_barber_compensation(uuid, barber_compensation_type, numeric, integer, chair_rental_frequency, boolean)`, `commission_percent_at(uuid, timestamptz)`, `get_shop_report(date, date)`, `get_my_barber_report(date, date)` (todas criadas na Task 2).
- Produces: nada.

- [ ] **Step 1: Escrever o teste**

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't42-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'af000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't42-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'af000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'af000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('af100000-0000-0000-0000-000000000001', 'T42 Shop', 'af000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent)
values
  ('af200000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'af000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 40),
  ('af200000-0000-0000-0000-000000000002', 'af100000-0000-0000-0000-000000000001', null, 'Barber B', 'commission', 40);

insert into public.customers (id, shop_id, full_name, email)
values ('af300000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'T42 Customer', 't42-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('af400000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values
  ('af500000-0000-0000-0000-000000000001', 'af100000-0000-0000-0000-000000000001', 'af200000-0000-0000-0000-000000000001', 'af400000-0000-0000-0000-000000000001'),
  ('af500000-0000-0000-0000-000000000002', 'af100000-0000-0000-0000-000000000001', 'af200000-0000-0000-0000-000000000002', 'af400000-0000-0000-0000-000000000001');

create function pg_temp.appt(barber uuid, back integer)
returns void language sql as $$
  insert into public.appointments (
    shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
    service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
  )
  select
    'af100000-0000-0000-0000-000000000001', barber, 'af300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
    ((current_date - back)::timestamp + interval '15 hours') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    ((current_date - back)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
    'completed', 'Cut', 30, 10000, 0
  from public.barber_services bs where bs.barber_id = barber
$$;

-- Barber A: one completed cut 10 days ago and one yesterday (R$ 100,00 each). Barber B: one 10 days ago.
select pg_temp.appt('af200000-0000-0000-0000-000000000001', 10);
select pg_temp.appt('af200000-0000-0000-0000-000000000001', 1);
select pg_temp.appt('af200000-0000-0000-0000-000000000002', 10);

create function pg_temp.share_a() returns integer language sql as $$
  select (b ->> 'barber_share_cents')::int
  from jsonb_array_elements(public.get_shop_report(current_date - 30, current_date + 2) -> 'barbers') b
  where b ->> 'name' = 'Barber A'
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);

select is(pg_temp.share_a(), 8000, 'constant 40% keeps the report as before: 2 x 100,00 x 40%');

-- "Only from now on": 40% -> 50%.
select lives_ok(
  $$ select * from public.set_barber_compensation('af200000-0000-0000-0000-000000000001', 'commission', 50, null, null, false) $$,
  'the owner raises the commission from now on'
);
select is(pg_temp.share_a(), 8000, 'past appointments keep the old 40%');
select is(
  (select commission_percent from public.list_owner_barbers() where id = 'af200000-0000-0000-0000-000000000001'),
  50::numeric, 'the barber row mirrors the current percent'
);

-- A new appointment after the change uses 50%.
reset role;
select pg_temp.appt('af200000-0000-0000-0000-000000000001', -1);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000001', true);
select is(pg_temp.share_a(), 13000, 'a future appointment uses the new 50%: 8000 + 100,00 x 50%');

-- Same percent: history untouched.
select lives_ok(
  $$ select * from public.set_barber_compensation('af200000-0000-0000-0000-000000000001', 'commission', 50, null, null, true) $$,
  'saving the same percent is a no-op even with the retroactive flag'
);
select is(pg_temp.share_a(), 13000, 'and nothing was rewritten');

-- Retroactive: 50% -> 60% over everything.
select lives_ok(
  $$ select * from public.set_barber_compensation('af200000-0000-0000-0000-000000000001', 'commission', 60, null, null, true) $$,
  'the owner applies 60% retroactively'
);
select is(pg_temp.share_a(), 18000, 'every appointment now uses 60%: 3 x 100,00 x 60%');

-- The barber report follows the same rule.
select set_config('request.jwt.claim.sub', 'af000000-0000-0000-0000-000000000002', true);
select is(
  (select sum((d ->> 'earnings_cents')::int)::int from jsonb_array_elements(public.get_my_barber_report(current_date - 30, current_date + 2) -> 'days') d),
  18000, 'the barber report uses the per-appointment percent too'
);

select * from finish();
rollback;
```

O teste tem 10 asserções. A de "daqui para frente" prova que o passado ficou em 40% depois de a taxa vigente virar 50%; o barbeiro de teste não tem linha de histórico antes, então isso também cobre a criação da linha-base em epoch.

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npx supabase test db`
Expected: FAIL em `042_commission_history.sql` (função `set_barber_compensation` com 6 argumentos não existe).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/042_commission_history.sql
git commit -m "test: commission rate history (failing)"
```

---

### Task 2: Migração 0060

**Files:**
- Create: `supabase/migrations/0060_commission_rate_history.sql`

**Interfaces:**
- Produces: `barber_commission_rates`, `commission_percent_at(target_barber uuid, at timestamptz) returns numeric`, `set_barber_compensation(target_barber_id uuid, new_type, new_commission_percent numeric default null, new_rental_amount_cents integer default null, new_rental_frequency chair_rental_frequency default null, apply_retroactively boolean default false)` com o mesmo `returns table`.

- [ ] **Step 1: Parte 1 — tabela, semente e função de lookup**

```sql
-- Commission rate history: each completed appointment earns the percent that was in force when it started.
create table public.barber_commission_rates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  barber_id uuid not null,
  percent numeric(5, 2) not null check (percent between 0 and 100),
  effective_from timestamptz not null,
  created_at timestamptz not null default now(),
  constraint barber_commission_rates_barber_fk foreign key (shop_id, barber_id) references public.barbers (shop_id, id) on delete cascade,
  constraint barber_commission_rates_unique unique (barber_id, effective_from)
);
alter table public.barber_commission_rates enable row level security;
revoke all on public.barber_commission_rates from public, anon, authenticated;

insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
select shop_id, id, commission_percent, 'epoch'::timestamptz
from public.barbers
where compensation_type = 'commission';

create function public.commission_percent_at(target_barber uuid, at timestamptz)
returns numeric
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce(
    (select r.percent from public.barber_commission_rates r
     where r.barber_id = target_barber and r.effective_from <= at
     order by r.effective_from desc limit 1),
    (select b.commission_percent from public.barbers b where b.id = target_barber)
  );
$$;
revoke all on function public.commission_percent_at(uuid, timestamptz) from public, anon, authenticated;
```

- [ ] **Step 2: Parte 2 — `set_barber_compensation` com `apply_retroactively`**

Acrescente ao mesmo arquivo. O corpo mantém as validações da `0026` e troca só o tratamento do histórico. Quando não existe nenhuma linha de histórico, "daqui para frente" primeiro grava a linha-base em epoch com o percentual antigo; sem isso o passado cairia no percentual novo pelo fallback de `commission_percent_at`.

```sql
drop function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency);

create function public.set_barber_compensation(
  target_barber_id uuid,
  new_type public.barber_compensation_type,
  new_commission_percent numeric default null,
  new_rental_amount_cents integer default null,
  new_rental_frequency public.chair_rental_frequency default null,
  apply_retroactively boolean default false
)
returns table (
  id uuid,
  compensation_type public.barber_compensation_type,
  commission_percent numeric,
  chair_rental_amount_cents integer,
  chair_rental_frequency public.chair_rental_frequency
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  target_shop uuid;
  old_type public.barber_compensation_type;
  old_percent numeric;
begin
  select b.shop_id, b.compensation_type, b.commission_percent
  into target_shop, old_type, old_percent
  from public.barbers b
  where b.id = target_barber_id;

  if target_shop is null or not public.is_shop_owner(target_shop) then
    raise exception using errcode = '42501', message = 'FORBIDDEN';
  end if;

  if new_type = 'commission' then
    if new_commission_percent is null
      or new_commission_percent not between 0 and 100
      or new_rental_amount_cents is not null
      or new_rental_frequency is not null then
      raise exception using errcode = 'P0021', message = 'COMPENSATION_INVALID';
    end if;
  else
    if new_rental_amount_cents is null
      or new_rental_amount_cents <= 0
      or new_rental_frequency is null
      or new_commission_percent is not null then
      raise exception using errcode = 'P0021', message = 'COMPENSATION_INVALID';
    end if;
  end if;

  if new_type = 'commission' then
    if old_type is distinct from 'commission' then
      delete from public.barber_commission_rates r where r.barber_id = target_barber_id;
      insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
      values (target_shop, target_barber_id, new_commission_percent, 'epoch');
    elsif new_commission_percent <> old_percent then
      if apply_retroactively then
        delete from public.barber_commission_rates r where r.barber_id = target_barber_id;
        insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
        values (target_shop, target_barber_id, new_commission_percent, 'epoch');
      else
        insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
        select target_shop, target_barber_id, old_percent, 'epoch'
        where not exists (select 1 from public.barber_commission_rates r where r.barber_id = target_barber_id);

        insert into public.barber_commission_rates (shop_id, barber_id, percent, effective_from)
        values (target_shop, target_barber_id, new_commission_percent, clock_timestamp())
        on conflict (barber_id, effective_from) do update set percent = excluded.percent;
      end if;
    end if;
  else
    delete from public.barber_commission_rates r where r.barber_id = target_barber_id;
  end if;

  return query
  update public.barbers
  set
    compensation_type = new_type,
    commission_percent = case when new_type = 'commission' then new_commission_percent else 0 end,
    chair_rental_amount_cents = case when new_type = 'chair_rental' then new_rental_amount_cents end,
    chair_rental_frequency = case when new_type = 'chair_rental' then new_rental_frequency end,
    updated_at = clock_timestamp()
  where barbers.id = target_barber_id
  returning
    barbers.id,
    barbers.compensation_type,
    barbers.commission_percent,
    barbers.chair_rental_amount_cents,
    barbers.chair_rental_frequency;
end;
$$;

revoke all on function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency, boolean) from public, anon;
grant execute on function public.set_barber_compensation(uuid, public.barber_compensation_type, numeric, integer, public.chair_rental_frequency, boolean) to authenticated;
```

- [ ] **Step 3: Parte 3 — `get_shop_report` por atendimento**

Copie a função `public.get_shop_report` inteira, com `create or replace`, de `supabase/migrations/0044_rent_payments.sql` (a partir de `create or replace function public.get_shop_report` até o `$$;` final) e os dois `revoke`/`grant` finais para o fim de `0060`. Depois faça **uma** troca, no bloco `barber_share_cents`:

Antes:
```sql
          (case
            when br.compensation_type = 'commission'
              then round(coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0) * br.commission_percent / 100)
            else coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)
          end)::int as barber_share_cents,
```

Depois:
```sql
          (case
            when br.compensation_type = 'commission'
              then round(coalesce(sum(a.service_price_cents_snapshot * public.commission_percent_at(br.id, a.starts_at)) filter (where a.status = 'completed'), 0) / 100)
            else coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0)
          end)::int as barber_share_cents,
```

- [ ] **Step 4: Parte 4 — `get_my_barber_report` por atendimento**

Copie `public.get_my_barber_report` de `supabase/migrations/0036_barber_report.sql` para o fim de `0060`, trocando `create function` por `create or replace function`, e faça duas trocas:

1. Remova a variável `share numeric;` do `declare` e as duas linhas que a calculam (o comentário `-- The barber's own share...` e `share := case ...`).
2. No bloco `days`, troque a linha `earnings_cents`:

Antes:
```sql
          round(coalesce(sum(a.service_price_cents_snapshot) filter (where a.status = 'completed'), 0) * share / 100)::int as earnings_cents,
```

Depois:
```sql
          round(coalesce(sum(a.service_price_cents_snapshot * (case when me.compensation_type = 'commission' then public.commission_percent_at(me.id, a.starts_at) else 100 end)) filter (where a.status = 'completed'), 0) / 100)::int as earnings_cents,
```

Mantenha o comentário de que o faturamento bruto nunca é devolvido ao barbeiro.

- [ ] **Step 5: Aplicar e rodar os testes SQL**

Run: `rtk npx supabase migration up && rtk npx supabase test db`
Expected: `042_commission_history.sql` passa; `021_barber_report.sql`, `023_owner_shop_report.sql` e `028_rent_payments.sql` continuam passando (prova de que o resultado com percentual constante não mudou). Se `013_barber_role.sql` ou outro teste chamar `set_barber_compensation` com a assinatura antiga de 5 argumentos, ele ainda funciona porque o sexto tem `default`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0060_commission_rate_history.sql supabase/tests/042_commission_history.sql
git commit -m "feat(db): commission rate history; reports use the percent in force per appointment"
```

---

### Task 3: Regra "quando perguntar" e API

**Files:**
- Create: `src/features/barbers/commission-change.ts`
- Create: `tests/unit/commission-change.test.ts`
- Modify: `src/features/barbers/api.ts` (função `setBarberCompensation`)
- Modify: `tests/integration/barber-side.test.ts` (asserções de `set_barber_compensation`)

**Interfaces:**
- Produces: `needsCommissionChoice(current: BarberCompensation, next: BarberCompensation): boolean`; `setBarberCompensation(supabase, barberId, input, options?: { applyRetroactively?: boolean })`.

- [ ] **Step 1: Teste da regra**

```ts
import { needsCommissionChoice } from "../../src/features/barbers/commission-change";

describe("needsCommissionChoice", () => {
  it("asks when a commission barber gets a different percent", () => {
    expect(needsCommissionChoice({ commissionPercent: 40, type: "commission" }, { commissionPercent: 50, type: "commission" })).toBe(true);
  });

  it("does not ask when the percent is unchanged", () => {
    expect(needsCommissionChoice({ commissionPercent: 40, type: "commission" }, { commissionPercent: 40, type: "commission" })).toBe(false);
  });

  it("does not ask when coming from chair rental (there is no earlier commission)", () => {
    expect(needsCommissionChoice({ amountCents: 30000, frequency: "monthly", type: "chair_rental" }, { commissionPercent: 40, type: "commission" })).toBe(false);
  });

  it("does not ask when moving to chair rental", () => {
    expect(needsCommissionChoice({ commissionPercent: 40, type: "commission" }, { amountCents: 30000, frequency: "monthly", type: "chair_rental" })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npx jest tests/unit/commission-change.test.ts`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Implementar**

```ts
import type { BarberCompensation } from "./types";

// The owner is asked "from now on, or retroactively?" only when an existing commission percent actually changes.
export function needsCommissionChoice(current: BarberCompensation, next: BarberCompensation): boolean {
  return current.type === "commission" && next.type === "commission" && current.commissionPercent !== next.commissionPercent;
}
```

- [ ] **Step 4: Teste da API (payload com a nova flag)**

Em `tests/integration/barber-side.test.ts`, localize os testes de `setBarberCompensation` (`rtk grep -n "set_barber_compensation" tests/integration/barber-side.test.ts`) e atualize os `toHaveBeenCalledWith` exatos para incluir `apply_retroactively: false`. Acrescente:

```ts
it("sends the retroactive flag when the owner asks for it", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ commission_percent: "50.00", compensation_type: "commission", id: "b1" }], error: null });

  await setBarberCompensation({ rpc } as never, "b1", { commissionPercent: 50, type: "commission" }, { applyRetroactively: true });

  expect(rpc).toHaveBeenCalledWith("set_barber_compensation", expect.objectContaining({ apply_retroactively: true, new_commission_percent: 50, target_barber_id: "b1" }));
});
```

Run: `rtk npx jest tests/integration/barber-side.test.ts` — Expected: FAIL.

- [ ] **Step 5: Implementar a API**

Em `src/features/barbers/api.ts`, `setBarberCompensation` passa a ter o quarto parâmetro e envia a flag:

```ts
export async function setBarberCompensation(
  supabase: Pick<SupabaseClient, "rpc">,
  barberId: string,
  input: BarberCompensation,
  options: { applyRetroactively?: boolean } = {},
) {
  const parsed = parseCompensationInput(input);
  const { data, error } = await supabase.rpc("set_barber_compensation", {
    apply_retroactively: options.applyRetroactively ?? false,
    new_commission_percent: parsed.type === "commission" ? parsed.commissionPercent : null,
    new_rental_amount_cents: parsed.type === "chair_rental" ? parsed.amountCents : null,
    new_rental_frequency: parsed.type === "chair_rental" ? parsed.frequency : null,
    new_type: parsed.type,
    target_barber_id: barberId,
  });
  if (error) throwBarberError(error);

  const row = (Array.isArray(data) ? data[0] : data) as CompensationRow | undefined;

  return row ? toCompensation(row) : parsed;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `rtk npx jest tests/unit/commission-change.test.ts tests/integration/barber-side.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/barbers tests/unit/commission-change.test.ts tests/integration/barber-side.test.ts
git commit -m "feat: setBarberCompensation carries the retroactive flag; rule for when to ask"
```

---

### Task 4: `ConfirmDialog` com ação alternativa

**Files:**
- Modify: `src/components/domain/ConfirmDialog.tsx`
- Create: `tests/unit/confirm-dialog.test.ts`

**Interfaces:**
- Produces: props opcionais `alternateLabel?: string`, `onAlternate?: () => void`, `confirmVariant?: "danger" | "dark"` (padrão `"danger"`). `testID` da alternativa: `confirm-dialog-alternate`.

- [ ] **Step 1: Teste**

```ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ConfirmDialog } from "../../src/components/domain/ConfirmDialog";

const base = { body: "Body", cancelLabel: "No", confirmLabel: "Yes", onCancel: jest.fn(), onConfirm: jest.fn(), title: "Title", visible: true };

describe("ConfirmDialog alternate action", () => {
  it("has no alternate button unless asked for", async () => {
    const view = await render(React.createElement(ConfirmDialog, base));

    expect(view.queryByTestId("confirm-dialog-alternate")).toBeNull();
  });

  it("renders the alternate button and fires it once", async () => {
    const onAlternate = jest.fn();
    const view = await render(React.createElement(ConfirmDialog, { ...base, alternateLabel: "Both", onAlternate }));

    await fireEvent.press(view.getByTestId("confirm-dialog-alternate"));

    expect(onAlternate).toHaveBeenCalledTimes(1);
    expect(view.getByText("Both")).toBeTruthy();
  });

  it("still confirms and cancels", async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const view = await render(React.createElement(ConfirmDialog, { ...base, confirmVariant: "dark", onCancel, onConfirm }));

    await fireEvent.press(view.getByTestId("confirm-dialog-confirm"));
    await fireEvent.press(view.getByTestId("confirm-dialog-cancel"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npx jest tests/unit/confirm-dialog.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implementar**

```tsx
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";

export type ConfirmDialogProps = {
  alternateLabel?: string;
  body: string;
  busy?: boolean;
  cancelLabel: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "dark";
  onAlternate?: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  visible: boolean;
};

// A small centred confirmation pop-up. Destructive by default; an optional second action covers "choose between two ways" prompts.
export function ConfirmDialog({ alternateLabel, body, busy = false, cancelLabel, confirmLabel, confirmVariant = "danger", onAlternate, onCancel, onConfirm, title, visible }: ConfirmDialogProps) {
  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onCancel}>
        <Pressable className="w-full max-w-[360px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="confirm-dialog">
          <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{title}</Text>
          <Text className="text-base font-sans text-neutral-700">{body}</Text>
          <View className="gap-2">
            <Button disabled={busy} label={confirmLabel} onPress={onConfirm} testID="confirm-dialog-confirm" variant={confirmVariant} />
            {alternateLabel && onAlternate ? (
              <Button disabled={busy} label={alternateLabel} onPress={onAlternate} testID="confirm-dialog-alternate" variant="outline" />
            ) : null}
            <Button label={cancelLabel} onPress={onCancel} testID="confirm-dialog-cancel" variant="ghost" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `rtk npx jest tests/unit/confirm-dialog.test.ts tests/unit` — Expected: PASS (nenhum chamador existente quebra: as props novas são opcionais).

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/ConfirmDialog.tsx tests/unit/confirm-dialog.test.ts
git commit -m "feat: ConfirmDialog accepts an alternate action and a non-destructive confirm"
```

---

### Task 5: Diálogo no `CompensationEditor` + textos

**Files:**
- Modify: `src/features/barbers/owner/CompensationEditor.tsx`
- Modify: `src/i18n/locales/pt.ts`, `src/i18n/locales/es.ts`, `src/i18n/locales/en.ts`
- Modify: `tests/e2e/owner-barbers.web.spec.ts`

**Interfaces:**
- Consumes: `needsCommissionChoice`, `setBarberCompensation(..., { applyRetroactively })`, `ConfirmDialog` (Task 4).
- Produces: chaves `owner.barbers.commissionChange.{title,body,forward,retroactive,cancel}`.

- [ ] **Step 1: Textos (três idiomas, mesmas chaves)**

Dentro de `owner.barbers` em cada locale (veja `rtk grep -n "commissionPercentLabel" src/i18n/locales/*.ts` para o ponto exato):

pt:
```ts
commissionChange: {
  body: "Isso muda o saldo de repasses já pagos e não pode ser desfeito. Deseja aplicar {{percent}}% também aos atendimentos anteriores?",
  cancel: "Cancelar",
  forward: "Só daqui para frente",
  retroactive: "Também nos anteriores",
  title: "Alterar comissão",
},
```
es:
```ts
commissionChange: {
  body: "Esto cambia el saldo de pagos ya realizados y no se puede deshacer. ¿Aplicar {{percent}}% también a las citas anteriores?",
  cancel: "Cancelar",
  forward: "Solo de ahora en adelante",
  retroactive: "También a las anteriores",
  title: "Cambiar comisión",
},
```
en:
```ts
commissionChange: {
  body: "This changes the balance of payouts already made and cannot be undone. Apply {{percent}}% to earlier appointments as well?",
  cancel: "Cancel",
  forward: "From now on only",
  retroactive: "Earlier ones too",
  title: "Change commission",
},
```

- [ ] **Step 2: Teste e2e (falha primeiro)**

Em `tests/e2e/owner-barbers.web.spec.ts`, ao lado do teste que já edita a comissão (`rtk grep -n "comp-save" tests/e2e/owner-barbers.web.spec.ts`), acrescente — reaproveitando `signInAsOwner` e `mockOwnerRest` do próprio arquivo:

```ts
test("changing an existing commission asks whether it also applies to earlier appointments", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/barber-profile?id=b1");
  await page.getByTestId("barber-comp-edit").click();
  await page.getByTestId("comp-percent").fill("55");
  await page.getByTestId("comp-save").click();

  await expect(page.getByTestId("confirm-dialog")).toContainText("Change commission");
  await page.getByTestId("confirm-dialog-alternate").click();

  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: true, new_commission_percent: 55 });
});

test("the owner can keep the past by choosing from now on, and cancel changes nothing", async ({ page }) => {
  const calls: Record<string, unknown> = {};

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);
  await page.goto("/barber-profile?id=b1");
  await page.getByTestId("barber-comp-edit").click();
  await page.getByTestId("comp-percent").fill("55");
  await page.getByTestId("comp-save").click();
  await page.getByTestId("confirm-dialog-cancel").click();
  expect(calls.compensation).toBeUndefined();

  await page.getByTestId("comp-save").click();
  await page.getByTestId("confirm-dialog-confirm").click();
  await expect.poll(() => calls.compensation).toMatchObject({ apply_retroactively: false, new_commission_percent: 55 });
});
```

O e2e roda em inglês (as asserções do arquivo usam "Commission 40%"), por isso o título esperado é "Change commission". O teste existente que edita a comissão (`await page.getByTestId("comp-save").click(); await expect.poll(() => calls.compensation).toMatchObject({ new_commission_percent: 55 });`) passa a abrir o diálogo, pois 40% → 55% é uma mudança: insira `await page.getByTestId("confirm-dialog-confirm").click();` entre o clique em `comp-save` e o `expect.poll`. Atualize qualquer outro `toMatchObject`/igualdade de `calls.compensation` para aceitar `apply_retroactively`.

Atualize também qualquer asserção existente de `calls.compensation` que use igualdade exata para incluir `apply_retroactively: false`.

- [ ] **Step 3: Implementar o fluxo no `CompensationEditor`**

Substitua o `save` por duas etapas: `requestSave` decide se pergunta; `save.mutate({ retroactive })` executa. Trechos a alterar:

```tsx
import { ConfirmDialog } from "../../../components/domain/ConfirmDialog";
import { needsCommissionChoice } from "../commission-change";
```

```tsx
  const [choosing, setChoosing] = useState(false);

  const save = useMutation({
    mutationFn: (retroactive: boolean) => {
      if (compType === "commission") return setBarberCompensation(supabase, barber.id, { commissionPercent: Number(percent), type: "commission" }, { applyRetroactively: retroactive });
      const amountCents = parseReaisToCents(rent);
      if (amountCents === null) throw Object.assign(new Error("invalid"), { code: "P0021" });

      return setBarberCompensation(supabase, barber.id, { amountCents, frequency: rentFrequency, type: "chair_rental" });
    },
    onError: (error) => {
      setChoosing(false);
      onFeedback(errorMessage(error, t, t("owner.barbers.compensationError")), "error");
    },
    onSuccess: () => {
      setChoosing(false);
      setEditing(false);
      onFeedback(t("owner.barbers.compensationSaved"), "success");
      void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] });
    },
  });

  const requestSave = () => {
    const next: BarberCompensation = compType === "commission" ? { commissionPercent: Number(percent), type: "commission" } : barber.compensation;

    if (compType === "commission" && needsCommissionChoice(barber.compensation, next)) return setChoosing(true);
    save.mutate(false);
  };
```

No botão salvar: `onPress={requestSave}`. Antes do `</Card>` final, dentro do `View` raiz, acrescente:

```tsx
        <ConfirmDialog
          alternateLabel={t("owner.barbers.commissionChange.retroactive")}
          body={t("owner.barbers.commissionChange.body", { percent: Number(percent) })}
          busy={save.isPending}
          cancelLabel={t("owner.barbers.commissionChange.cancel")}
          confirmLabel={t("owner.barbers.commissionChange.forward")}
          confirmVariant="dark"
          onAlternate={() => save.mutate(true)}
          onCancel={() => setChoosing(false)}
          onConfirm={() => save.mutate(false)}
          title={t("owner.barbers.commissionChange.title")}
          visible={choosing}
        />
```

Importe o tipo: `import type { BarberCompensation, OwnerBarber } from "../types";` (já existe).

- [ ] **Step 4: Verificação**

Run: `rtk npm run typecheck && rtk npm run lint && rtk npx jest`
Expected: tudo verde; `component-translations`/testes de paridade de locale passam.

Run (e2e rápido, ver `project_local_dev_gotchas`; mover `.env.local` antes): `rtk npm run e2e:export && rtk npx playwright test tests/e2e/owner-barbers.web.spec.ts`
Expected: PASS nos testes novos e nos antigos do arquivo.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "feat: ask whether a commission change applies to earlier appointments"
```

---

### Task 6: Verificação final e PR

- [ ] **Step 1:** `rtk npm run verify` (typecheck, lint, jest, runner e2e, `supabase test db`). Corrigir o que falhar antes de seguir.
- [ ] **Step 2:** Verificação visual no navegador (memória "Verify UI in a browser"): abrir a edição de comissão de um barbeiro, salvar um percentual diferente, capturar tela do diálogo e checar o CSS computado dos botões (fundo escuro no "Só daqui para frente", contorno no alternativo).
- [ ] **Step 3:** `git push -u origin feat-payouts-01-commission-history` e abrir PR (base `main`) com `gh api` REST se `gh pr create` falhar (ver `reference_gh_projects_classic`). Vincular o PR (`bind_pr`) e ligar o Auto-fix (`set_monitor`). Não fazer merge.
