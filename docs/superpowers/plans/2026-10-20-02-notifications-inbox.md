# Notifications Inbox (Bell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A bell icon (top-left) on customer Home, barber Agenda and owner Agenda opens a persisted notification list with unread badge.

**Architecture:** New `public.notifications` table filled by an AFTER trigger on `appointments` (separate from the existing push `notification_outbox`, which stays untouched). Rows store a `kind` + `params`; text is rendered client-side per viewer language. Client polls unread count (React Query `refetchInterval` + the existing AppState focus refetch) — no Realtime (YAGNI).

**Tech Stack:** Postgres/Supabase (pgTAP in `supabase/tests`), React Query, expo-router, NativeWind, i18next.

**Spec:** `docs/superpowers/plans/2026-10-20-ux-overhaul-index.md`

## Global Constraints
- Branch `feat-notifications-inbox` from `main`; migration number is the next free one (`0046_notifications_inbox.sql` at time of writing — `ls supabase/migrations | tail -1` first).
- Never notify the actor: skip `auth.uid()` as recipient.
- Kinds (exact strings): `appointment_awaiting_confirmation`, `appointment_booked`, `appointment_confirmed`, `appointment_cancelled`, `appointment_rescheduled`.
- Recipients: customer = `customers.user_id`; barber = `barbers.user_id`; owner = `shops.owner_user_id`. De-duplicate when two roles are the same user.
- Customer receives only `confirmed`, `cancelled`, `rescheduled`. Barber and owner receive `awaiting_confirmation` (insert as `scheduled`), `booked` (insert as `confirmed`), `cancelled`, `rescheduled`.
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
select plan(8);
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

create or replace function public.add_inbox_notification(target_user uuid, target_kind text, appt public.appointments, key_suffix text default '')
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if target_user is null or target_user is not distinct from auth.uid() then return; end if;
  insert into public.notifications (user_id, kind, appointment_id, params, event_key)
  select target_user, target_kind, appt.id,
    jsonb_build_object('service_name', appt.service_name_snapshot, 'starts_at', appt.starts_at,
      'customer_name', c.full_name, 'barber_name', b.name),
    format('%s:%s:%s%s', appt.id, target_kind, target_user, key_suffix)
  from public.customers c, public.barbers b
  where c.id = appt.customer_id and c.shop_id = appt.shop_id and b.id = appt.barber_id and b.shop_id = appt.shop_id
  on conflict (event_key) do nothing;
end;
$$;
revoke all on function public.add_inbox_notification(uuid, text, public.appointments, text) from public;

create or replace function public.appointments_inbox_events()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  customer_user uuid; barber_user uuid; owner_user uuid;
  staff_kind text; customer_kind text; suffix text := '';
begin
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

  if customer_kind is not null then perform public.add_inbox_notification(customer_user, customer_kind, new, suffix); end if;
  if staff_kind is not null then
    perform public.add_inbox_notification(barber_user, staff_kind, new, suffix);
    if owner_user is distinct from barber_user then perform public.add_inbox_notification(owner_user, staff_kind, new, suffix); end if;
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
- [ ] **Step 3:** `NotificationsScreen.tsx`: `ScreenHeader` (title `notifications.title`, `onBack`), button "Mark all as read" (calls `markRead(supabase)` then invalidate `["notifications"]` and `["notifications-unread"]`), list of `Card`s from `useQuery({ queryKey: ["notifications", userId], queryFn: () => listNotifications(supabase) })`. Each card: bold title `t(inboxText(kind).titleKey)`, body `t(inboxText(kind).bodyKey, { customerName, serviceName, barberName, date: formatDateNumeric(localDate, language) + " " + localTime })` with `formatInstantInShopTime(new Date(startsAt))`; unread rows have a left 3px `bg-primary-500` bar and call `markRead(supabase, [id])` on press; pressing navigates nowhere (YAGNI). Use `useRefreshAll` pull-to-refresh as other screens.
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
