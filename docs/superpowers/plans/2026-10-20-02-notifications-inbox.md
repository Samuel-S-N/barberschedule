# Notifications Inbox (Bell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A bell icon (top-left) on customer Home, barber Agenda and owner Agenda opens a persisted notification list with unread badge; tapping an item opens the relevant screen; barbers and owners also receive the same events as push notifications.

**Architecture:** New `public.notifications` table filled by an AFTER trigger on `appointments` (the existing customer push triggers stay untouched; the new trigger additionally enqueues push rows in the existing `notification_outbox` for the events that were never pushed: customer "confirmed" and all barber/owner events — dispatch is the existing `dispatch-notifications` edge function with new message templates). Rows store a `kind` + `params`; text is rendered client-side per viewer language. Client polls unread count (React Query `refetchInterval` + the existing AppState focus refetch) — no Realtime (YAGNI).

**Tech Stack:** Postgres/Supabase (pgTAP in `supabase/tests`), React Query, expo-router, NativeWind, i18next.

**Spec:** `docs/superpowers/plans/2026-10-20-ux-overhaul-index.md`

## Global Constraints
- Branch `feat-notifications-inbox` from `main`; migration number is the next free one (`0046_notifications_inbox.sql` at time of writing — `ls supabase/migrations | tail -1` first).
- Never notify the actor: skip `auth.uid()` as recipient.
- Kinds (exact strings): `appointment_awaiting_confirmation`, `appointment_booked`, `appointment_confirmed`, `appointment_cancelled`, `appointment_rescheduled`.
- Recipients: customer = `customers.user_id`; barber = `barbers.user_id`; owner = `shops.owner_user_id`. De-duplicate when two roles are the same user.
- Customer receives only `confirmed`, `cancelled`, `rescheduled`. Barber and owner receive `awaiting_confirmation` (insert as `scheduled`), `booked` (insert as `confirmed`), `cancelled`, `rescheduled`.
- Push (new): `usePushRegistration` is only mounted in the customer layout today; mount it in the barber and owner layouts too. New outbox event types: `appointment.confirmed` (customer), `staff.awaiting_confirmation`, `staff.booked`, `staff.cancelled`, `staff.rescheduled`, `recurrence.requested`, `recurrence.accepted`, `recurrence.rejected` (the last three are enqueued by Plan 6; their templates ship here). Customer cancelled/rescheduled pushes already exist (`enqueue_appointment_notification`) — do not enqueue them twice.
- Recurrence-generated appointments (`appointments.source = 'recurrence'`) never create inbox rows or pushes (the engine inserts up to 90 days at once; it would flood barber and owner).
- Tapping an item navigates by role/kind (`inboxRoute`, Task 3b); items are marked read on tap.
- Text never stored; i18n keys under `notifications.*` in `en.ts`, `es.ts`, `pt.ts`.
- Jest matches `tests/**/*.test.ts` only. Memory: use `rtk`, verify UI in browser, TDD.

---

### Task 1: Table, RLS, trigger, RPCs (pgTAP)

**Files:** Create `supabase/migrations/0046_notifications_inbox.sql`; Test `supabase/tests/011_notifications_inbox.sql`

**Produces (DB):** table `notifications(id, user_id, kind, appointment_id, params jsonb, event_key unique, read_at, created_at)`; RPCs `public.mark_notifications_read(target_ids uuid[] default null) returns integer` (null = all mine), `public.count_unread_notifications() returns integer`.

- [ ] **Step 1: failing pgTAP test.** Copy the fixture style of `supabase/tests/009_notifications.sql` (users `90…01` owner, `90…02` customer; add `90…03` barber user with `update public.profiles set role='barber'`; shop, customer row, barber row with `user_id` = barber user, service, barber_service). Then:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
-- fixture ... (as in 009) plus barber user linked to barbers.user_id

-- act as the customer booking: insert scheduled appointment as service role (auth.uid() null)
insert into public.appointments (...same columns as 009...) values (...);

select is((select count(*)::int from public.notifications where user_id = '90000000-0000-0000-0000-000000000003' and kind = 'appointment_awaiting_confirmation'), 1, 'barber is told about a new scheduled appointment');
select is((select count(*)::int from public.notifications where user_id = '90000000-0000-0000-0000-000000000001' and kind = 'appointment_awaiting_confirmation'), 1, 'owner is told too');
select is((select count(*)::int from public.notifications where user_id = '90000000-0000-0000-0000-000000000002'), 0, 'customer gets nothing for a booking');

update public.appointments set status = 'confirmed' where id = '95000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.notifications where user_id = '90000000-0000-0000-0000-000000000002' and kind = 'appointment_confirmed'), 1, 'customer is told about confirmation');

update public.appointments set status = 'cancelled' where id = '95000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.notifications where kind = 'appointment_cancelled'), 3, 'customer, barber and owner are told about cancellation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select is((select count(*)::int from public.notifications), 2, 'RLS: customer sees only own rows');
select is(public.count_unread_notifications(), 2, 'unread count');
select is(public.mark_notifications_read(null), 2, 'mark all read');

-- recurrence-generated appointments stay silent
reset role;
insert into public.appointments (...same columns as above, source = 'recurrence', recurrence_series_id/occurrence_date per the identity check...) values (...);
select is((select count(*)::int from public.notifications where appointment_id = '<recurrence appt id>'), 0, 'recurrence appointments do not notify');

-- push rows for events that were never pushed
select is((select count(*)::int from public.notification_outbox where event_type = 'staff.awaiting_confirmation'), 2, 'barber and owner get a push for the new appointment');
select is((select count(*)::int from public.notification_outbox where event_type = 'appointment.confirmed' and recipient_user_id = '90000000-0000-0000-0000-000000000002'), 1, 'customer gets a confirmation push');
select is((select count(*)::int from public.notification_outbox where event_type = 'staff.cancelled'), 2, 'barber and owner get a cancellation push');
select is((select count(*)::int from public.notification_outbox where event_type = 'appointment.cancelled' and recipient_user_id = '90000000-0000-0000-0000-000000000002'), 1, 'customer cancellation push comes only from the existing trigger (no duplicate)');
select * from finish();
rollback;
```
- [ ] **Step 2:** `npm run test:db` → FAIL (relation missing).
- [ ] **Step 3: migration**

```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('appointment_awaiting_confirmation','appointment_booked','appointment_confirmed','appointment_cancelled','appointment_rescheduled')),
  appointment_id uuid references public.appointments (id) on delete set null,
  params jsonb not null default '{}'::jsonb,
  event_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());

alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked','appointment.cancelled','appointment.rescheduled','appointment.reminder','recurrence.conflict',
  'appointment.confirmed','staff.awaiting_confirmation','staff.booked','staff.cancelled','staff.rescheduled',
  'recurrence.requested','recurrence.accepted','recurrence.rejected'));

create or replace function public.add_inbox_notification(
  target_user uuid, target_kind text, appt public.appointments, key_suffix text default '', push_event text default null
)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  event_params jsonb;
  event_key text := format('%s:%s:%s%s', appt.id, target_kind, target_user, key_suffix);
begin
  if target_user is null or target_user is not distinct from auth.uid() then return; end if;
  select jsonb_build_object('service_name', appt.service_name_snapshot, 'starts_at', appt.starts_at,
    'customer_name', c.full_name, 'barber_name', b.name)
  into event_params
  from public.customers c, public.barbers b
  where c.id = appt.customer_id and c.shop_id = appt.shop_id and b.id = appt.barber_id and b.shop_id = appt.shop_id;
  if event_params is null then return; end if;

  insert into public.notifications (user_id, kind, appointment_id, params, event_key)
  values (target_user, target_kind, appt.id, event_params, event_key)
  on conflict (event_key) do nothing;

  if found and push_event is not null then
    insert into public.notification_outbox (event_key, event_type, recipient_user_id, appointment_id, payload)
    values ('push:' || event_key, push_event, target_user, appt.id,
      event_params || jsonb_build_object('appointment_id', appt.id, 'shop_id', appt.shop_id, 'status', appt.status))
    on conflict (event_key) do nothing;
  end if;
end;
$$;
revoke all on function public.add_inbox_notification(uuid, text, public.appointments, text, text) from public;

create or replace function public.appointments_inbox_events()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  customer_user uuid; barber_user uuid; owner_user uuid;
  staff_kind text; customer_kind text; push_event text; suffix text := '';
begin
  if new.source = 'recurrence' then return new; end if;
  select user_id into customer_user from public.customers where id = new.customer_id and shop_id = new.shop_id;
  select user_id into barber_user from public.barbers where id = new.barber_id and shop_id = new.shop_id;
  select owner_user_id into owner_user from public.shops where id = new.shop_id;

  if tg_op = 'INSERT' then
    staff_kind := case new.status when 'scheduled' then 'appointment_awaiting_confirmation' when 'confirmed' then 'appointment_booked' end;
    customer_kind := case new.status when 'confirmed' then 'appointment_confirmed' end;
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    staff_kind := 'appointment_cancelled'; customer_kind := 'appointment_cancelled';
  elsif new.status = 'confirmed' and old.status = 'scheduled' then
    customer_kind := 'appointment_confirmed';
  elsif new.starts_at is distinct from old.starts_at and new.status in ('scheduled','confirmed') then
    staff_kind := 'appointment_rescheduled'; customer_kind := 'appointment_rescheduled';
    suffix := ':' || new.starts_at::text;
  end if;

  -- Customer cancelled/rescheduled pushes already come from enqueue_appointment_notification, and an INSERT already pushes "booked" to the customer; only the scheduled→confirmed UPDATE is new.
  if customer_kind is not null then
    perform public.add_inbox_notification(customer_user, customer_kind, new, suffix,
      case when tg_op = 'UPDATE' and customer_kind = 'appointment_confirmed' then 'appointment.confirmed' end);
  end if;
  if staff_kind is not null then
    push_event := 'staff.' || replace(staff_kind, 'appointment_', '');
    perform public.add_inbox_notification(barber_user, staff_kind, new, suffix, push_event);
    if owner_user is distinct from barber_user then perform public.add_inbox_notification(owner_user, staff_kind, new, suffix, push_event); end if;
  end if;
  return new;
end;
$$;

create trigger appointments_inbox_events after insert or update on public.appointments
for each row execute function public.appointments_inbox_events();

create or replace function public.count_unread_notifications() returns integer language sql stable security invoker as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notifications_read(target_ids uuid[] default null) returns integer
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare changed integer;
begin
  if auth.uid() is null then raise exception using errcode = 'P0016', message = 'NOTIFICATION_FORBIDDEN'; end if;
  update public.notifications set read_at = clock_timestamp()
  where user_id = auth.uid() and read_at is null and (target_ids is null or id = any (target_ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.count_unread_notifications() to authenticated;
```
Note: `count_unread_notifications` runs as invoker, so RLS applies. A cancelled appointment trigger fires for rescheduling too (barber rescheduling uses UPDATE of starts_at) — covered by the rescheduled branch.

- [ ] **Step 4:** `npm run test:db` → PASS (adjust expected counts if the fixture's actor differs; the service-role insert has `auth.uid()` null so nobody is skipped).
- [ ] **Step 5:** commit `feat(db): notifications inbox table and triggers`.

---

### Task 2: Client API and text mapping

**Files:** Create `src/features/notifications/inbox-api.ts`, `src/features/notifications/inbox-text.ts`; Test `tests/unit/inbox.test.ts`

**Produces:**
```ts
export type InboxKind = "appointment_awaiting_confirmation" | "appointment_booked" | "appointment_confirmed" | "appointment_cancelled" | "appointment_rescheduled";
export type InboxItem = { id: string; kind: InboxKind; appointmentId: string | null; params: { serviceName: string; startsAt: string; customerName: string; barberName: string }; readAt: string | null; createdAt: string };
listNotifications(supabase, limit = 50): Promise<InboxItem[]>
countUnread(supabase): Promise<number>
markRead(supabase, ids?: string[]): Promise<number>
inboxText(kind: InboxKind): { titleKey: string; bodyKey: string }   // keys under notifications.*
```

- [ ] **Step 1: failing test**

```ts
import { countUnread, listNotifications, markRead } from "../../src/features/notifications/inbox-api";
import { inboxText } from "../../src/features/notifications/inbox-text";

it("maps rows", async () => {
  const order = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue({ data: [{ id: "n1", kind: "appointment_cancelled", appointment_id: "a1", params: { service_name: "Cut", starts_at: "2026-10-21T13:00:00Z", customer_name: "Ana", barber_name: "Bia" }, read_at: null, created_at: "2026-10-20T10:00:00Z" }], error: null }) });
  const supabase = { from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order }) }) };
  const [item] = await listNotifications(supabase as never);
  expect(item).toEqual({ id: "n1", kind: "appointment_cancelled", appointmentId: "a1", params: { serviceName: "Cut", startsAt: "2026-10-21T13:00:00Z", customerName: "Ana", barberName: "Bia" }, readAt: null, createdAt: "2026-10-20T10:00:00Z" });
});
it("counts and marks", async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: 3, error: null }).mockResolvedValueOnce({ data: 2, error: null });
  expect(await countUnread({ rpc } as never)).toBe(3);
  expect(await markRead({ rpc } as never, ["n1"])).toBe(2);
  expect(rpc).toHaveBeenLastCalledWith("mark_notifications_read", { target_ids: ["n1"] });
});
it("has text keys for every kind", () => {
  expect(inboxText("appointment_confirmed")).toEqual({ bodyKey: "notifications.appointment_confirmed.body", titleKey: "notifications.appointment_confirmed.title" });
});
```
- [ ] **Step 2:** `npx jest tests/unit/inbox.test.ts` → FAIL.
- [ ] **Step 3: implement**

```ts
// inbox-api.ts
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = Pick<SupabaseClient, "from" | "rpc">;
export type InboxKind = "appointment_awaiting_confirmation" | "appointment_booked" | "appointment_confirmed" | "appointment_cancelled" | "appointment_rescheduled";
export type InboxItem = { id: string; kind: InboxKind; appointmentId: string | null; params: { serviceName: string; startsAt: string; customerName: string; barberName: string }; readAt: string | null; createdAt: string };
type Row = { id: string; kind: InboxKind; appointment_id: string | null; params: { service_name: string; starts_at: string; customer_name: string; barber_name: string }; read_at: string | null; created_at: string };

export async function listNotifications(supabase: Client, limit = 50): Promise<InboxItem[]> {
  const { data, error } = await supabase.from("notifications").select("id, kind, appointment_id, params, read_at, created_at").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;

  return ((data ?? []) as Row[]).map((row) => ({
    appointmentId: row.appointment_id, createdAt: row.created_at, id: row.id, kind: row.kind,
    params: { barberName: row.params.barber_name, customerName: row.params.customer_name, serviceName: row.params.service_name, startsAt: row.params.starts_at },
    readAt: row.read_at,
  }));
}

export async function countUnread(supabase: Pick<SupabaseClient, "rpc">) {
  const { data, error } = await supabase.rpc("count_unread_notifications");
  if (error) throw error;

  return Number(data ?? 0);
}

export async function markRead(supabase: Pick<SupabaseClient, "rpc">, ids?: string[]) {
  const { data, error } = await supabase.rpc("mark_notifications_read", { target_ids: ids ?? null });
  if (error) throw error;

  return Number(data ?? 0);
}
```
```ts
// inbox-text.ts
import type { InboxKind } from "./inbox-api";

export function inboxText(kind: InboxKind) {
  return { bodyKey: `notifications.${kind}.body`, titleKey: `notifications.${kind}.title` };
}
```
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat: notifications inbox client api`.

---

### Task 3: i18n strings

**Files:** Modify `src/i18n/locales/en.ts`, `es.ts`, `pt.ts` (types derive from `en`; `tsc` fails if a locale is missing a key).

- [ ] Add a top-level `notifications` block to all three. `en`:

```ts
notifications: {
  title: "Notifications", empty: "No notifications yet", loadError: "Unable to load notifications.", markAllRead: "Mark all as read", bellLabel: "Notifications",
  appointment_awaiting_confirmation: { title: "Awaiting confirmation", body: "{{customerName}} · {{serviceName}} · {{date}}" },
  appointment_booked: { title: "New appointment", body: "{{customerName}} · {{serviceName}} · {{date}}" },
  appointment_confirmed: { title: "Appointment confirmed", body: "{{serviceName}} with {{barberName}} · {{date}}" },
  appointment_cancelled: { title: "Appointment cancelled", body: "{{serviceName}} · {{date}}" },
  appointment_rescheduled: { title: "Appointment rescheduled", body: "{{serviceName}} · now {{date}}" },
},
```
`pt`: title "Notificações", empty "Nenhuma notificação ainda", loadError "Não foi possível carregar as notificações.", markAllRead "Marcar todas como lidas", bellLabel "Notificações", awaiting "Aguardando confirmação", booked "Novo agendamento", confirmed "Agendamento confirmado", cancelled "Agendamento cancelado", rescheduled "Agendamento remarcado" (bodies: `{{customerName}} · {{serviceName}} · {{date}}`, `{{serviceName}} com {{barberName}} · {{date}}`, `{{serviceName}} · agora {{date}}`). `es`: "Notificaciones", "Aún no hay notificaciones", "No se pudieron cargar las notificaciones.", "Marcar todas como leídas", "Pendiente de confirmación", "Nueva cita", "Cita confirmada", "Cita cancelada", "Cita reprogramada" (`con {{barberName}}` → `con`, `ahora {{date}}`).
- [ ] `npm run typecheck` PASS; commit `feat(i18n): notification strings`.

---

### Task 3b: Push templates (edge function)

**Files:** Modify `supabase/functions/dispatch-notifications/messages.ts`; Test `tests/unit/notification-messages.test.ts`

**Produces:** `buildMessage(eventType, locale, payload)` also handles `appointment.confirmed`, `staff.awaiting_confirmation`, `staff.booked`, `staff.cancelled`, `staff.rescheduled`, `recurrence.requested`, `recurrence.accepted`, `recurrence.rejected`. Payload fields used: `service_name`, `starts_at`, `customer_name`, `interval_weeks` (1 or 2).

- [ ] **Step 1: failing tests** (append to the existing file):

```ts
describe("staff and recurrence push messages", () => {
  const staff = { customer_name: "Ana", interval_weeks: 2, service_name: "Corte", starts_at: "2026-08-17T12:00:00Z" };

  it.each([
    ["appointment.confirmed", "pt", "Agendamento confirmado"],
    ["staff.awaiting_confirmation", "pt", "Aguardando confirmação"],
    ["staff.awaiting_confirmation", "en", "Awaiting confirmation"],
    ["staff.booked", "es", "Nueva cita"],
    ["staff.cancelled", "pt", "Agendamento cancelado"],
    ["staff.rescheduled", "en", "Appointment rescheduled"],
    ["recurrence.requested", "pt", "Novo pedido de recorrência"],
    ["recurrence.accepted", "en", "Recurrence accepted"],
    ["recurrence.rejected", "es", "Recurrencia rechazada"],
  ])("%s in %s has the title %s", (eventType, locale, title) => {
    expect(buildMessage(eventType, locale, staff).title).toBe(title);
  });

  it("names the customer, service and shop-local time for staff events", () => {
    const body = buildMessage("staff.booked", "pt", staff).body;
    expect(body).toContain("Ana");
    expect(body).toContain("Corte");
    expect(body).toContain("09:00");
  });

  it("names the frequency for recurrence events", () => {
    expect(buildMessage("recurrence.requested", "pt", staff).body).toContain("a cada 2 semanas");
    expect(buildMessage("recurrence.requested", "en", { ...staff, interval_weeks: 1 }).body).toContain("weekly");
  });
});
```
- [ ] **Step 2:** `npx jest tests/unit/notification-messages.test.ts` → FAIL.
- [ ] **Step 3: implement** — add above `formatWhen`:

```ts
type Ctx = { customer: string; frequency: string; service: string; when: string };
type ExtendedTemplate = { title: string; body: (c: Ctx) => string };

const FREQUENCY: Record<Locale, Record<1 | 2, string>> = {
  en: { 1: "weekly", 2: "every 2 weeks" },
  es: { 1: "semanal", 2: "cada 2 semanas" },
  pt: { 1: "semanal", 2: "a cada 2 semanas" },
};

const EXTENDED: Record<string, Record<Locale, ExtendedTemplate>> = {
  "appointment.confirmed": {
    en: { body: (c) => `${c.service} on ${c.when} is confirmed.`, title: "Appointment confirmed" },
    es: { body: (c) => `Tu cita de ${c.service} el ${c.when} está confirmada.`, title: "Cita confirmada" },
    pt: { body: (c) => `${c.service} em ${c.when} foi confirmado.`, title: "Agendamento confirmado" },
  },
  "staff.awaiting_confirmation": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Awaiting confirmation" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Pendiente de confirmación" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Aguardando confirmação" },
  },
  "staff.booked": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "New appointment" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Nueva cita" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.when}`, title: "Novo agendamento" },
  },
  "staff.cancelled": {
    en: { body: (c) => `${c.customer} cancelled ${c.service} on ${c.when}.`, title: "Appointment cancelled" },
    es: { body: (c) => `${c.customer} canceló ${c.service} el ${c.when}.`, title: "Cita cancelada" },
    pt: { body: (c) => `${c.customer} cancelou ${c.service} em ${c.when}.`, title: "Agendamento cancelado" },
  },
  "staff.rescheduled": {
    en: { body: (c) => `${c.customer} · ${c.service} moved to ${c.when}.`, title: "Appointment rescheduled" },
    es: { body: (c) => `${c.customer} · ${c.service} reprogramada para ${c.when}.`, title: "Cita reprogramada" },
    pt: { body: (c) => `${c.customer} · ${c.service} remarcado para ${c.when}.`, title: "Agendamento remarcado" },
  },
  "recurrence.requested": {
    en: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "New recurrence request" },
    es: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Nuevo pedido de recurrencia" },
    pt: { body: (c) => `${c.customer} · ${c.service} · ${c.frequency}`, title: "Novo pedido de recorrência" },
  },
  "recurrence.accepted": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrence accepted" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrencia aceptada" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recorrência aceita" },
  },
  "recurrence.rejected": {
    en: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrence declined" },
    es: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recurrencia rechazada" },
    pt: { body: (c) => `${c.service} · ${c.frequency}`, title: "Recorrência recusada" },
  },
};
```
In `buildMessage`, before `const catalog = APPOINTMENT_EVENTS[eventType];` add:

```ts
  const extended = EXTENDED[eventType];

  if (extended) {
    const text = (value: unknown) => (typeof value === "string" ? value : "");
    const template = extended[language];

    return {
      body: template.body({
        customer: text(payload.customer_name),
        frequency: FREQUENCY[language][Number(payload.interval_weeks) === 2 ? 2 : 1],
        service: text(payload.service_name) || GENERIC_SERVICE[language],
        when: formatWhen(payload.starts_at, language, timeZone),
      }),
      title: template.title,
    };
  }
```
- [ ] **Step 4:** run → PASS (existing cases must still pass; the English title for `recurrence.rejected` is "Recurrence declined" — the test table above uses the `es` row only). Commit `feat: push templates for staff and recurrence events`.

---

### Task 3c: Tap navigation

**Files:** Create `src/features/notifications/inbox-route.ts`; Test `tests/unit/inbox.test.ts` (append)

**Produces:** `inboxRoute(kind: InboxKind, role: "customer" | "barber" | "owner"): string`.

- [ ] **Step 1: failing test**

```ts
import { inboxRoute } from "../../src/features/notifications/inbox-route";

it("routes appointment events to the role's agenda", () => {
  expect(inboxRoute("appointment_confirmed", "customer")).toBe("/appointments");
  expect(inboxRoute("appointment_awaiting_confirmation", "barber")).toBe("/my-agenda");
  expect(inboxRoute("appointment_cancelled", "owner")).toBe("/agenda");
});
```
- [ ] **Step 2:** FAIL → **Step 3:**

```ts
import type { InboxKind } from "./inbox-api";

const AGENDA = { barber: "/my-agenda", customer: "/appointments", owner: "/agenda" } as const;

// Plan 6 adds the recurrence kinds here.
export function inboxRoute(_kind: InboxKind, role: keyof typeof AGENDA) {
  return AGENDA[role];
}
```
- [ ] **Step 4:** PASS; commit `feat: notification tap routes`.

---

### Task 3d: Register push for barber and owner

**Files:** Modify `app/(barber)/_layout.tsx`, `app/(owner)/_layout.tsx`

- [ ] **Step 1:** in the barber layout, call `usePushRegistration(Boolean(barber.data));` right after the `barber` query and **before** the early returns (hooks must not be conditional). Import from `../../src/features/notifications/use-push-registration`.
- [ ] **Step 2:** owner layout: add `const { profile } = useSupabaseSession();` and `usePushRegistration(profile?.role === "owner");` at the top of `OwnerLayout`.
- [ ] **Step 3:** `npm run typecheck && npx jest tests/integration/app-providers.test.ts`; on web `registerPushToken` returns null (Platform web), so there is no web test — **verify on a phone**: sign in as barber/owner in a dev build, check a row appears in `notification_tokens` for that user, book as customer, and confirm the push arrives (Expo Go cannot receive remote push on SDK 53+; use the dev build, see memory *local dev gotchas*).
- [ ] **Step 4:** commit `feat: register push tokens for barber and owner`.

---

### Task 4: Bell component, hook, screen, routes

**Files:** Create `src/features/notifications/use-unread.ts`, `src/components/domain/NotificationBell.tsx`, `src/features/notifications/NotificationsScreen.tsx`, `app/(customer)/notifications.tsx`, `app/(barber)/notifications.tsx`, `app/(owner)/notifications.tsx`; Modify `src/components/domain/index.ts`, `app/(customer)/_layout.tsx` (add `<Stack.Screen name="notifications" />`), `app/(barber)/_layout.tsx` (`<Tabs.Screen name="notifications" options={{ href: null }} />`), `app/(owner)/_layout.tsx` (add `"notifications"` to `MANAGE_SCREENS`? — no: add a third const `AGENDA_SCREENS = ["notifications"]` highlighting `agenda`).

**Interfaces — Consumes:** Task 2 API; `useSupabaseSession()`, `useBack()` (from Plan 1: `useBack(fallback)`), `ScreenHeader`, `EmptyState`, `SkeletonBlock`, `formatDateLabel(localDate, language)` + `formatInstantInShopTime` from `src/lib/dates/shop-time`.
**Produces:** `useUnreadCount(): UseQueryResult<number>` (key `["notifications-unread", userId]`, `refetchInterval: 30_000`); `<NotificationBell onPress />` (lucide `Bell`, 44px hit area, red badge using `bg-danger-500` showing count, `99+` cap, `testID="notification-bell"`, `accessibilityLabel={t("notifications.bellLabel")}`); `NotificationsScreen` default export.

- [ ] **Step 1:** `use-unread.ts`

```ts
import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { countUnread } from "./inbox-api";

export function useUnreadCount() {
  const { profile, supabase } = useSupabaseSession();

  return useQuery({ enabled: Boolean(profile), queryFn: () => countUnread(supabase), queryKey: ["notifications-unread", profile?.userId], refetchInterval: 30_000 });
}
```
- [ ] **Step 2:** `NotificationBell.tsx`

```tsx
import { Bell } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useUnreadCount } from "../../features/notifications/use-unread";
import { colors } from "../../lib/design/colors";

export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const unread = useUnreadCount().data ?? 0;

  return (
    <Pressable accessibilityLabel={t("notifications.bellLabel")} accessibilityRole="button" className="min-h-[44px] min-w-[44px] items-center justify-center" hitSlop={8} onPress={onPress} testID="notification-bell">
      <Bell color={colors.ink} size={26} />
      {unread > 0 ? (
        <View className="absolute right-1 top-1 min-w-[18px] items-center rounded-full bg-danger-500 px-1" testID="notification-badge">
          <Text className="text-xs font-sans-medium text-white">{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
```
Export from `src/components/domain/index.ts`.
- [ ] **Step 3:** `NotificationsScreen.tsx`: `ScreenHeader` (title `notifications.title`, `onBack`), button "Mark all as read" (calls `markRead(supabase)` then invalidate `["notifications"]` and `["notifications-unread"]`), list of `Card`s from `useQuery({ queryKey: ["notifications", userId], queryFn: () => listNotifications(supabase) })`. Each card: bold title `t(inboxText(kind).titleKey)`, body `t(inboxText(kind).bodyKey, { customerName, serviceName, barberName, date: formatDateNumeric(localDate, language) + " " + localTime })` with `formatInstantInShopTime(new Date(startsAt))`; unread rows have a left 3px `bg-primary-500` bar; pressing any row calls `markRead(supabase, [id])` (if unread) and then `router.push(inboxRoute(item.kind, profile.role))` (`profile` from `useSupabaseSession()`; type-cast the string as `never` like `manage.tsx` does). Use `useRefreshAll` pull-to-refresh as other screens.
- [ ] **Step 4:** the three route files each: `export { default } from "../../src/features/notifications/NotificationsScreen";`
- [ ] **Step 5:** layouts as listed above; `npm run typecheck && npm run lint`.
- [ ] **Step 6:** commit `feat: notifications screen and bell component`.

---

### Task 5: Place the bell on the three home screens

**Files:** Modify `app/(customer)/(tabs)/home.tsx:44-48`, `app/(barber)/my-agenda.tsx:311-313`, `app/(owner)/agenda.tsx` header (Plan 5 retitles it; do the bell first, keep the `Text` untouched).

- [ ] Wrap each header `<Text accessibilityRole="header" …>` in `<View className="w-full max-w-[420px] flex-row items-center gap-2">` with `<NotificationBell onPress={() => router.push("/notifications")} />` **first** (top-left) and the title `flex-1` after it. Barber screen needs `useRouter` import if missing.
- [ ] Browser check (web, mobile viewport 375): screenshot each of the 3 screens; bell at left, title not clipped (see memory *verify UI in browser*). Insert a notification row via SQL (`psql` to local Supabase) for a test user and confirm the badge, list and "mark all read".
- [ ] E2E `tests/e2e/notifications.web.spec.ts` (copy `signInAsOwner` + `mockOwnerRest` shape from `owner-barbers.web.spec.ts`): mock `**/rpc/count_unread_notifications` → `2` and `**/rest/v1/notifications` → one row; assert badge text `2`, click bell, URL `/notifications`, row title visible; click "Mark all as read" and assert the `mark_notifications_read` RPC was called.
- [ ] `npm run typecheck && npm run lint && npx jest`; commit `feat: bell on customer, barber and owner home`.

---

### Task 6: Review and PR
- [ ] `/code-review`; push `feat-notifications-inbox`; open PR via `gh api` REST (memory: GraphQL breaks). Note in PR: hosted Supabase migration is the user's deploy step.
