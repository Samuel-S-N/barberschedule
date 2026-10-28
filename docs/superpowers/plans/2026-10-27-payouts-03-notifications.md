# Notificações de repasse — plano de implementação (PR3 de 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono recebe, no dia do repasse, uma notificação (sino e push) com os barbeiros que vencem hoje e têm saldo; o barbeiro recebe uma notificação quando um repasse é registrado.

**Architecture:** Dois tipos novos (`payout_due`, `payout_paid`) na caixa `notifications` e na `notification_outbox`. Uma função SQL `enqueue_payout_due_notifications(now_at)` roda de hora em hora (via `pg_cron`, quando existir) e é idempotente pelo `event_key`. `record_barber_payout` passa a gerar o aviso ao barbeiro. A edge function `dispatch-notifications` ganha os textos de push; o app ganha texto e rota para os dois tipos.

**Tech Stack:** Postgres/Supabase (pgTAP, `pg_cron`), Deno edge function, TypeScript, Expo Router, i18next (pt/es/en), Jest, Playwright (REST mockado).

**Spec:** `docs/superpowers/specs/2026-10-27-barber-payouts-design.md` (seção "PR3"). Depende do PR2 (`payout_due_dates`, `payout_earned_cents`, `payout_paid_cents`, `record_barber_payout`).

## Global Constraints

- Migração: `supabase/migrations/0062_payout_notifications.sql`.
- A caixa guarda só `kind` e `params`; o texto é montado por idioma de quem lê. `appointment_id` fica nulo nessas linhas.
- Lembrete do dono: um por dono por dia local, a partir das 08:00 no fuso da barbearia, só para barbeiros ativos de comissão com agenda, vencimento hoje, saldo > 0 e nenhum repasse com `paid_on` igual ou posterior a hoje. `event_key = 'payout_due:<dono>:<data>'`; push `'push:' || event_key`.
- Aviso ao barbeiro: só se ele tem conta (`user_id` não nulo) e não é quem opera. `event_key = 'payout_paid:<payout_id>'`. Apagar um repasse não notifica.
- A função do job é `revoke all ... from public, anon, authenticated` (o `pg_cron` roda como `postgres`); os testes a chamam direto.
- Sem o `pg_cron` (Supabase local), o agendamento é pulado sem erro, como em `0022_notification_jobs.sql`.
- Textos em pt, es e en com as mesmas chaves. Sem plural do i18next nas chaves da caixa (o tipo das chaves de `t` quebra): o corpo usa lista de nomes.
- Commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Comandos de saída longa levam `rtk`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0062_payout_notifications.sql` | constraints, `payout_due_barbers`, `enqueue_payout_due_notifications`, `record_barber_payout` com aviso, cron |
| `supabase/tests/044_payout_notifications.sql` | pgTAP do job e do aviso |
| `supabase/functions/dispatch-notifications/messages.ts` | textos de push de `payout.due` e `payout.paid` |
| `tests/unit/notification-messages.test.ts` | casos novos (arquivo existente) |
| `src/features/notifications/inbox-api.ts` | `InboxKind` e params novos |
| `src/features/notifications/inbox-route.ts` | rotas dos dois tipos |
| `src/features/notifications/NotificationsScreen.tsx` | params novos no corpo |
| `src/i18n/locales/{pt,es,en}.ts` | `notifications.payout_due` e `notifications.payout_paid` |
| `tests/unit/payout-inbox.test.ts`, `tests/e2e/owner-payouts.web.spec.ts` | rota/mapeamento e fluxo do sino |

---

### Task 1: Testes SQL (falham primeiro)

**Files:**
- Create: `supabase/tests/044_payout_notifications.sql`

**Interfaces:**
- Consumes (Task 2): `enqueue_payout_due_notifications(now_at timestamptz default clock_timestamp()) returns integer`; `payout_due_barbers(target_shop uuid, local_date date) returns table (barber_id uuid, barber_name text)`; `record_barber_payout` com aviso.

- [ ] **Step 1: Escrever o teste**

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
create function pg_temp.at_local(h integer, m integer) returns timestamptz language sql as $$
  select (pg_temp.today()::timestamp + make_interval(hours => h, mins => m)) at time zone 'America/Sao_Paulo'
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't44-owner@example.com', 'x', now()),
  ('00000000-0000-0000-0000-000000000000', 'b1000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't44-barber@example.com', 'x', now());

update public.profiles set role = 'owner' where user_id = 'b1000000-0000-0000-0000-000000000001';
update public.profiles set role = 'barber' where user_id = 'b1000000-0000-0000-0000-000000000002';

insert into public.shops (id, name, owner_user_id, timezone)
values ('b1100000-0000-0000-0000-000000000001', 'T44 Shop', 'b1000000-0000-0000-0000-000000000001', 'America/Sao_Paulo');

-- A (has an account, earns money) and B (no account, no earnings) are both due today.
insert into public.barbers (id, shop_id, user_id, name, compensation_type, commission_percent, payout_schedule, payout_day_1, payout_tracking_start)
values
  ('b1200000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'Barber A', 'commission', 50, 'weekly', extract(dow from pg_temp.today())::smallint, pg_temp.today() - 20),
  ('b1200000-0000-0000-0000-000000000002', 'b1100000-0000-0000-0000-000000000001', null, 'Barber B', 'commission', 40, 'weekly', extract(dow from pg_temp.today())::smallint, pg_temp.today() - 20);

insert into public.customers (id, shop_id, full_name, email)
values ('b1300000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'T44 Customer', 't44-c@example.com');

insert into public.services (id, shop_id, name, duration_minutes, price_cents)
values ('b1400000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'Cut', 30, 10000);

insert into public.barber_services (id, shop_id, barber_id, service_id)
values ('b1500000-0000-0000-0000-000000000001', 'b1100000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001', 'b1400000-0000-0000-0000-000000000001');

insert into public.appointments (
  shop_id, barber_id, customer_id, barber_service_id, service_id, starts_at, ends_at, occupied_until, status,
  service_name_snapshot, service_duration_minutes_snapshot, service_price_cents_snapshot, barber_buffer_minutes_snapshot
)
select
  'b1100000-0000-0000-0000-000000000001', 'b1200000-0000-0000-0000-000000000001', 'b1300000-0000-0000-0000-000000000001', bs.id, bs.service_id,
  ((current_date - 2)::timestamp + interval '15 hours') at time zone 'UTC',
  ((current_date - 2)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
  ((current_date - 2)::timestamp + interval '15 hours 30 minutes') at time zone 'UTC',
  'completed', 'Cut', 30, 10000, 0
from public.barber_services bs where bs.barber_id = 'b1200000-0000-0000-0000-000000000001';

-- The job (runs as the table owner, like pg_cron).
select is(public.enqueue_payout_due_notifications(pg_temp.at_local(7, 0)), 0, 'nothing is sent before 08:00 shop time');
select is(public.enqueue_payout_due_notifications(pg_temp.at_local(8, 30)), 1, 'one notification for the owner after 08:00');
select is(
  (select (params ->> 'count')::int from public.notifications where kind = 'payout_due' and user_id = 'b1000000-0000-0000-0000-000000000001'),
  1, 'it counts only barbers with a balance (B has nothing to receive)'
);
select is(
  (select count(*)::int from public.notification_outbox where event_type = 'payout.due' and recipient_user_id = 'b1000000-0000-0000-0000-000000000001'),
  1, 'and queues the push'
);
select is(public.enqueue_payout_due_notifications(pg_temp.at_local(9, 30)), 0, 'running again the same day creates nothing');

select is((select count(*)::int from public.payout_due_barbers('b1100000-0000-0000-0000-000000000001', pg_temp.today())), 1, 'A is due before being paid');

-- The owner pays A and B.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select is((select amount_cents from public.record_barber_payout('b1200000-0000-0000-0000-000000000001', 1000, pg_temp.today())), 1000, 'the owner pays A');
reset role;

select is((select count(*)::int from public.payout_due_barbers('b1100000-0000-0000-0000-000000000001', pg_temp.today())), 0, 'a barber already paid today is no longer due');
select is(
  (select (params ->> 'amount_cents')::int from public.notifications where kind = 'payout_paid' and user_id = 'b1000000-0000-0000-0000-000000000002'),
  1000, 'A is told about the payout'
);
select is(
  (select count(*)::int from public.notification_outbox where event_type = 'payout.paid' and recipient_user_id = 'b1000000-0000-0000-0000-000000000002'),
  1, 'with a push'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
select public.record_barber_payout('b1200000-0000-0000-0000-000000000002', 500, pg_temp.today());
select public.delete_barber_payout((select id from public.list_barber_payouts(pg_temp.today() - 1, pg_temp.today() + 1) where amount_cents = 1000));
reset role;

select is((select count(*)::int from public.notifications where kind = 'payout_paid'), 1, 'a barber without an account and a deleted payout produce no extra notification');

select * from finish();
rollback;
```

> São 11 asserções, confirme com `plan(11)`. O `current_date - 2` das consultas de atendimento é só "dois dias atrás"; qualquer data passada serve.

- [ ] **Step 2: Rodar e ver falhar**

Run: `rtk npx supabase test db`
Expected: FAIL em `044_payout_notifications.sql` (funções inexistentes).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/044_payout_notifications.sql
git commit -m "test: payout notifications (failing)"
```

---

### Task 2: Migração 0062

**Files:**
- Create: `supabase/migrations/0062_payout_notifications.sql`

**Interfaces:**
- Produces: `payout_due_barbers`, `enqueue_payout_due_notifications`, `record_barber_payout` (mesma assinatura, agora notificando).

- [ ] **Step 1: Constraints dos dois tipos**

```sql
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'appointment_awaiting_confirmation', 'appointment_booked', 'appointment_confirmed', 'appointment_cancelled', 'appointment_rescheduled',
  'recurrence_requested', 'recurrence_accepted', 'recurrence_rejected',
  'recurrence_cancel_requested', 'recurrence_cancel_accepted', 'recurrence_cancel_declined',
  'payout_due', 'payout_paid'));

alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict',
  'appointment.confirmed', 'staff.awaiting_confirmation', 'staff.booked', 'staff.cancelled', 'staff.rescheduled',
  'recurrence.requested', 'recurrence.accepted', 'recurrence.rejected',
  'recurrence.cancel_requested', 'recurrence.cancel_accepted', 'recurrence.cancel_declined',
  'payout.due', 'payout.paid'));
```

- [ ] **Step 2: Quem vence hoje**

```sql
create function public.payout_due_barbers(target_shop uuid, local_date date)
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
    and not exists (select 1 from public.barber_payouts p where p.barber_id = b.id and p.paid_on >= local_date)
    and public.payout_earned_cents(b.id, b.payout_tracking_start, s.timezone) - public.payout_paid_cents(b.id, b.payout_tracking_start) > 0
  order by b.name;
$$;
revoke all on function public.payout_due_barbers(uuid, date) from public, anon, authenticated;
```

- [ ] **Step 3: O job do lembrete**

```sql
create function public.enqueue_payout_due_notifications(now_at timestamptz default clock_timestamp())
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  sh record;
  local_date date;
  due_count integer;
  due_names jsonb;
  inbox_key text;
  event_params jsonb;
  created integer := 0;
begin
  for sh in select s.id, s.owner_user_id, s.timezone from public.shops s loop
    continue when (now_at at time zone sh.timezone)::time < time '08:00';
    local_date := (now_at at time zone sh.timezone)::date;

    select count(*)::int, coalesce(jsonb_agg(d.barber_name order by d.barber_name) filter (where d.rn <= 3), '[]'::jsonb)
    into due_count, due_names
    from (
      select x.barber_name, row_number() over (order by x.barber_name) as rn
      from public.payout_due_barbers(sh.id, local_date) x
    ) d;

    continue when due_count = 0;

    inbox_key := format('payout_due:%s:%s', sh.owner_user_id, local_date);
    event_params := jsonb_build_object('count', due_count, 'barber_names', due_names, 'date', local_date);

    insert into public.notifications (user_id, kind, params, event_key)
    values (sh.owner_user_id, 'payout_due', event_params, inbox_key)
    on conflict (event_key) do nothing;

    if found then
      insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
      values ('push:' || inbox_key, 'payout.due', sh.owner_user_id, event_params)
      on conflict (event_key) do nothing;
      created := created + 1;
    end if;
  end loop;

  return created;
end;
$$;
revoke all on function public.enqueue_payout_due_notifications(timestamptz) from public, anon, authenticated;

do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema extensions';
    if to_regnamespace('cron') is not null then
      execute $sql$select cron.schedule('barberschedule-payout-due', '5 * * * *', 'select public.enqueue_payout_due_notifications();')$sql$;
    end if;
  end if;
end
$schedule$;
```

- [ ] **Step 4: `record_barber_payout` avisa o barbeiro**

Copie `public.record_barber_payout` de `0061_barber_payouts.sql` como `create or replace function` (mesma assinatura e retorno). No `declare` acrescente `barber_user uuid;` e `inbox_key text;`. Logo após o `insert ... returning * into result;` acrescente:

```sql
  select b.user_id into barber_user from public.barbers b where b.id = target_barber_id;

  if barber_user is not null and barber_user is distinct from auth.uid() then
    inbox_key := 'payout_paid:' || result.id;

    insert into public.notifications (user_id, kind, params, event_key)
    values (barber_user, 'payout_paid', jsonb_build_object('amount_cents', result.amount_cents, 'paid_on', result.paid_on), inbox_key)
    on conflict (event_key) do nothing;

    insert into public.notification_outbox (event_key, event_type, recipient_user_id, payload)
    values ('push:' || inbox_key, 'payout.paid', barber_user, jsonb_build_object('amount_cents', result.amount_cents, 'paid_on', result.paid_on))
    on conflict (event_key) do nothing;
  end if;
```

Repita ao final `revoke all on function public.record_barber_payout(uuid, integer, date, text) from public, anon;` e o `grant execute ... to authenticated;`.

- [ ] **Step 5: Aplicar e rodar**

Run: `rtk npx supabase migration up && rtk npx supabase test db`
Expected: `044_payout_notifications.sql` passa (11 asserções); `043_barber_payouts.sql` continua passando (a redefinição de `record_barber_payout` não pode regredir o PR2).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0062_payout_notifications.sql supabase/tests/044_payout_notifications.sql
git commit -m "feat(db): payout due reminder job and payout-received notification"
```

---

### Task 3: Textos de push na edge function

**Files:**
- Modify: `supabase/functions/dispatch-notifications/messages.ts`
- Modify: `tests/unit/notification-messages.test.ts`

**Interfaces:**
- Produces: `buildMessage("payout.due" | "payout.paid", locale, payload)` com `payload = { count: number; barber_names: string[]; date: string }` e `{ amount_cents: number; paid_on: string }`.

- [ ] **Step 1: Testes (falham primeiro)**

Acrescente a `tests/unit/notification-messages.test.ts` (o arquivo já importa `buildMessage`):

```ts
describe("payout push messages", () => {
  it("tells the owner who is due today, in the owner's language", () => {
    expect(buildMessage("payout.due", "pt", { barber_names: ["Ana", "Caio"], count: 2, date: "2026-10-27" })).toEqual({
      body: "Ana, Caio",
      title: "Hoje é dia de repasse",
    });
    expect(buildMessage("payout.due", "en", { barber_names: ["Ana"], count: 1, date: "2026-10-27" }).title).toBe("Payout day");
  });

  it("marks that more barbers are due than the names listed", () => {
    expect(buildMessage("payout.due", "es", { barber_names: ["Ana", "Beto", "Caio"], count: 5, date: "2026-10-27" }).body).toBe("Ana, Beto, Caio +2");
  });

  it("tells the barber how much arrived", () => {
    const message = buildMessage("payout.paid", "pt", { amount_cents: 7050, paid_on: "2026-10-27" });

    expect(message.title).toBe("Repasse recebido");
    expect(message.body).toContain("70,50");
  });
});
```

Run: `rtk npx jest tests/unit/notification-messages.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

Em `messages.ts`, antes de `formatWhen`, acrescente o catálogo e o formatador:

```ts
const MONEY_LOCALE_TAG = LOCALE_TAG;

function formatMoney(cents: unknown, locale: Locale) {
  return new Intl.NumberFormat(MONEY_LOCALE_TAG[locale], { currency: "BRL", style: "currency" }).format(Number(cents) / 100);
}

const PAYOUT_TITLES: Record<string, Record<Locale, string>> = {
  "payout.due": { en: "Payout day", es: "Hoy toca pagar a barberos", pt: "Hoje é dia de repasse" },
  "payout.paid": { en: "Payout received", es: "Pago recibido", pt: "Repasse recebido" },
};
```

E, em `buildMessage`, logo após o bloco do `recurrence.conflict` e antes de `const extended = EXTENDED[eventType];`:

```ts
  if (eventType === "payout.due") {
    const names = Array.isArray(payload.barber_names) ? payload.barber_names.map(String) : [];
    const extra = Number(payload.count) - names.length;

    return { body: `${names.join(", ")}${extra > 0 ? ` +${extra}` : ""}`, title: PAYOUT_TITLES[eventType][language] };
  }

  if (eventType === "payout.paid") {
    return { body: `${formatMoney(payload.amount_cents, language)} · ${formatDate(payload.paid_on, language)}`, title: PAYOUT_TITLES[eventType][language] };
  }
```

(`formatDate` já existe no arquivo e aceita `YYYY-MM-DD`.)

- [ ] **Step 3: Rodar**

Run: `rtk npx jest tests/unit/notification-messages.test.ts`
Expected: PASS. Se o separador decimal do `Intl` em pt-BR vier com espaço não separável (`R$ 70,50`), mantenha `toContain("70,50")` como está.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions tests/unit/notification-messages.test.ts
git commit -m "feat: push texts for payout reminders and received payouts"
```

---

### Task 4: Caixa de notificações no app

**Files:**
- Modify: `src/features/notifications/inbox-api.ts`, `inbox-route.ts`, `NotificationsScreen.tsx`
- Modify: `src/i18n/locales/pt.ts`, `es.ts`, `en.ts`
- Create: `tests/unit/payout-inbox.test.ts`

**Interfaces:**
- Produces: `InboxKind` ganha `"payout_due" | "payout_paid"`; `InboxItem.params` ganha `amountCents: number | null`, `barberNames: string`, `paidOn: string`; `inboxRoute("payout_due", "owner") === "/payouts"`, `inboxRoute("payout_paid", "barber") === "/my-profile/compensation"`.

- [ ] **Step 1: Teste (falha primeiro)**

```ts
import { inboxRoute } from "../../src/features/notifications/inbox-route";
import { inboxText } from "../../src/features/notifications/inbox-text";
import { listNotifications } from "../../src/features/notifications/inbox-api";

describe("payout notifications in the inbox", () => {
  it("routes the owner reminder to the payouts screen and the barber notice to the compensation screen", () => {
    expect(inboxRoute("payout_due", "owner")).toBe("/payouts");
    expect(inboxRoute("payout_paid", "barber")).toBe("/my-profile/compensation");
  });

  it("uses per-kind translation keys", () => {
    expect(inboxText("payout_due")).toEqual({ bodyKey: "notifications.payout_due.body", titleKey: "notifications.payout_due.title" });
  });

  it("maps payout params from the database row", async () => {
    const order = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue({
      data: [
        { appointment_id: null, created_at: "2026-10-27T11:00:00Z", id: "n1", kind: "payout_due", params: { barber_names: ["Ana", "Caio"], count: 4, date: "2026-10-27" }, read_at: null },
        { appointment_id: null, created_at: "2026-10-27T12:00:00Z", id: "n2", kind: "payout_paid", params: { amount_cents: 7000, paid_on: "2026-10-27" }, read_at: null },
      ],
      error: null,
    }) });
    const supabase = { from: () => ({ select: () => ({ order }) }) };

    const items = await listNotifications(supabase as never);

    expect(items[0].params).toMatchObject({ barberNames: "Ana, Caio +2" });
    expect(items[1].params).toMatchObject({ amountCents: 7000, paidOn: "2026-10-27" });
  });
});
```

Run: `rtk npx jest tests/unit/payout-inbox.test.ts` → FAIL.

- [ ] **Step 2: Implementar**

`inbox-api.ts`: acrescente `| "payout_due" | "payout_paid"` ao `InboxKind`; ao `params` do `InboxItem` acrescente `amountCents: number | null; barberNames: string; paidOn: string;`; ao tipo `Row.params` acrescente `amount_cents?: number; barber_names?: string[]; count?: number; paid_on?: string;`; no `map`:

```ts
    params: {
      amountCents: row.params.amount_cents ?? null,
      barberName: row.params.barber_name ?? "",
      barberNames: namesLabel(row.params.barber_names ?? [], row.params.count ?? 0),
      customerName: row.params.customer_name ?? "",
      intervalWeeks: row.params.interval_weeks ?? null,
      paidOn: row.params.paid_on ?? "",
      serviceName: row.params.service_name ?? "",
      startsAt: row.params.starts_at ?? "",
    },
```
e, acima de `listNotifications`:
```ts
// "Ana, Caio +2": the first names plus how many more are due than were listed.
function namesLabel(names: string[], count: number) {
  const extra = count - names.length;

  return `${names.join(", ")}${extra > 0 ? ` +${extra}` : ""}`;
}
```

`inbox-route.ts`:
```ts
const PAYOUTS: Record<Role, string> = { barber: "/my-profile/compensation", customer: "/appointments", owner: "/payouts" };

export function inboxRoute(kind: InboxKind, role: Role) {
  if (kind.startsWith("payout_")) return PAYOUTS[role];

  return kind.startsWith("recurrence_") ? REQUESTS[role] : AGENDA[role];
}
```

`NotificationsScreen.tsx`: no objeto de opções de `t(text.bodyKey, {...})` acrescente
```tsx
                            amount: item.params.amountCents === null ? "" : formatPriceBRL(item.params.amountCents),
                            names: item.params.barberNames,
```
e troque `date: when(item.params.startsAt)` por
```tsx
                            date: item.kind === "payout_paid" ? formatDayMonth(item.params.paidOn) : when(item.params.startsAt),
```
com os imports `formatPriceBRL` de `../../components/domain/ServiceCard` e `formatDayMonth` de `../payouts/format`.

Textos, dentro do bloco `notifications` de cada locale (ao lado de `recurrence_requested`, ordem alfabética):
pt: `payout_due: { body: "{{names}}", title: "Hoje é dia de repasse" }, payout_paid: { body: "{{amount}} · {{date}}", title: "Repasse recebido" },`
es: `payout_due: { body: "{{names}}", title: "Hoy toca pagar a barberos" }, payout_paid: { body: "{{amount}} · {{date}}", title: "Pago recibido" },`
en: `payout_due: { body: "{{names}}", title: "Payout day" }, payout_paid: { body: "{{amount}} · {{date}}", title: "Payout received" },`

- [ ] **Step 3: Rodar**

Run: `rtk npx jest tests/unit/payout-inbox.test.ts && rtk npm run typecheck && rtk npm run lint && rtk npx jest`
Expected: PASS (inclusive os testes de paridade de locale e os que montam `InboxItem` à mão: se algum fixture de teste construir `params` completo, acrescente os três campos novos).

- [ ] **Step 4: Commit**

```bash
git add src tests
git commit -m "feat: payout notifications in the app inbox"
```

---

### Task 5: E2E do sino, verificação e PR

**Files:**
- Modify: `tests/e2e/owner-payouts.web.spec.ts`

- [ ] **Step 1: Teste e2e (falha primeiro)**

Acrescente ao arquivo (reaproveitando `signInAsOwner` e `mockOwnerRest` já definidos nele) um segundo mock que serve a caixa de notificações. A tela de notificações do dono é `/owner-notifications`; confirme as chamadas REST dela com `rtk grep -n "rpc(\|from(" src/features/notifications/inbox-api.ts` (usa `from("notifications")` e RPCs de contagem/leitura) e responda a elas:

```ts
test("tapping the payout reminder opens the payouts screen", async ({ page }) => {
  await signInAsOwner(page);
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/notifications")) {
      return json(route, [{ appointment_id: null, created_at: "2026-10-27T11:00:00Z", id: "n1", kind: "payout_due", params: { barber_names: ["Ana Barber", "Caio Avulso"], count: 2, date: "2026-10-27" }, read_at: null }]);
    }
    if (path.endsWith("/rpc/get_payout_overview")) return json(route, overview);
    if (path.endsWith("/rpc/list_barber_payouts")) return json(route, []);
    if (path.includes("/rpc/")) return json(route, null);
    await route.abort();
  });

  await page.goto("/owner-notifications");
  await expect(page.getByTestId("notification-n1")).toContainText("Payout day");
  await expect(page.getByTestId("notification-n1")).toContainText("Ana Barber, Caio Avulso");
  await page.getByTestId("notification-n1").click();

  await expect(page).toHaveURL(/\/payouts/);
  await expect(page.getByTestId("payout-card-b1")).toBeVisible();
});
```

Run: `rtk npm run e2e:export && rtk npx playwright test tests/e2e/owner-payouts.web.spec.ts`
Expected: PASS depois da Task 4 (se algum RPC de marcação como lida bloquear a navegação, ele já cai no ramo genérico `path.includes("/rpc/")`).

- [ ] **Step 2: Verificação completa**

Run: `rtk npm run verify`
Expected: tudo verde.

- [ ] **Step 3: Verificação manual do job (pilha local)**

Com a pilha local rodando (`running-barberschedule-locally`), crie um barbeiro de comissão com agenda semanal no dia de hoje e um atendimento concluído, rode `select public.enqueue_payout_due_notifications(now() + interval '12 hours');` (ajuste o instante para depois das 08:00 no fuso) e confirme: a notificação aparece no sino do dono no navegador (captura de tela) com o título e os nomes; ao registrar um repasse na tela `/payouts`, a conta do barbeiro vê "Repasse recebido".

- [ ] **Step 4: Commit, push e PR**

```bash
git add tests
git commit -m "test(e2e): payout reminder opens the payouts screen"
git push -u origin feat-payouts-03-notifications
```

Abrir PR com base `feat-payouts-02-payouts` (REST via `gh api` se `gh pr create` falhar), `bind_pr`, `set_monitor` (Auto-fix). Sem merge.

---

## Desvios registrados na execução

- O teste SQL tem 11 asserções (o rascunho dizia 12).
- `tests/unit/inbox.test.ts` precisou dos três campos novos de `params` (`amountCents`, `barberNames`, `paidOn`).
- O corpo de `payout_due` mostra os nomes ("Ana, Caio +2"); o título é "Hoje é dia de repasse" (pt), "Payout day" (en), "Hoy toca pagar a barberos" (es).
- Verificado no app real (Metro web + Supabase local): tocar no lembrete abre `/payouts` com a etiqueta "Due today"; o aviso `payout_paid` aparece no sino do barbeiro e abre a remuneração. A função do job foi executada à mão com um instante às 12:00 (o `pg_cron` não roda no ambiente local). O push em si (edge function `dispatch-notifications`) não foi exercitado localmente; só os textos têm teste.
- Os dados de teste criados no banco local durante a verificação foram removidos.
