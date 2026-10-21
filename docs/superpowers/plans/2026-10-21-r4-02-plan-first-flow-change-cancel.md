# Plan-First Flow, Change and Cancellation Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The customer picks **Plano › Barbeiro › Dia (vertical list) › Horário › Revisão › Enviar**; with a current plan the top "Assinar plano" button is replaced by a fixed bottom bar with **Alterar plano**, and an active plan has **Solicitar cancelamento**; staff accept or decline both.

**Architecture:** One migration adds `replaces_series_id` to requests and `cancel_requested_at` to series, re-creates `request_recurrence` (two optional "replaces" params) and `decide_recurrence_request` (accepting ends the replaced series), and adds the cancellation RPCs and notification kinds. The app merges every barber's plans into plan-first offers (no new RPC). The customer screen is split into a state/list part and small flow components; the staff Pedidos tabs get a `CancellationCard`.

**Tech Stack:** Postgres/pgTAP, Deno edge function messages, Expo Router, React Query (`useQueries`), NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round4-design.md`

## Global Constraints
- Branch `feat-plan-change-cancel` from `main` after `fix-ended-series-state` is merged (or from it). Migration `0058_plan_change_and_cancellation.sql`, pgTAP `040_plan_change_cancel.sql`.
- Errors: **P0037 `RECURRENCE_CANCEL_NOT_ALLOWED`**, **P0038 `RECURRENCE_CANCEL_NOT_REQUESTED`** (add to `domain-errors.ts` and `errors.codes` en/pt/es). Replacing someone else's series or a non-pending request is `P0015 RECURRENCE_INVALID` (existing).
- Notification kinds `recurrence_cancel_requested|accepted|declined`; push event types `recurrence.cancel_requested|accepted|declined`; text in `notifications.<kind>.{title,body}` (en/pt/es) and in `supabase/functions/dispatch-notifications/messages.ts`; the inbox route reuses `recurrence_` → requests screen.
- A customer has at most one **current plan** = newest request whose display status is `pending`, `active` or `cancel_requested`. "Alterar plano" replaces it; others are history.
- Step keys: `plan, barber, weekday, time, review, send`; labels Plano, Barbeiro, Dia, Horário, Revisão, Enviar (en: Plan, Barber, Day, Time, Review, Send). Weekdays: one full-width row per day, Monday…Sunday, test ids `weekday-1..7`; a day with no free time is disabled with a caption.
- Test ids: bottom bar `plans-bottom-bar`, change `plan-change`, cancel request `plan-cancel-request`, confirm dialog `confirm-dialog*` (exists), staff `cancellation-<seriesId>`, `cancellation-accept-<seriesId>`, `cancellation-decline-<seriesId>`; offers `offer-<planId>`, barber `offer-barber-<barberId>`.
- pgTAP must also pass on a clean database (CI): scope counts to the test's own ids; clean-DB check via the isolated stack (see `r4-01` Task 1 step 4).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `rtk`; verify at 375px; Expo restart before e2e (`/tmp/claude-1000/restart.sh`; restore `.env.local` at the end). No hosted environment exists, so no deploy notes.

---

### Task 1: Database (pgTAP first)

**Files:** Create `supabase/migrations/0058_plan_change_and_cancellation.sql`, `supabase/tests/040_plan_change_cancel.sql`.

**Produces (DB):**
`request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time, target_replaces_series_id uuid default null, target_replaces_request_id uuid default null)`;
`list_my_recurrence_requests()` + `cancel_requested_at timestamptz`;
`request_series_cancellation(target_series_id uuid) → void`; `decide_series_cancellation(target_series_id uuid, accept boolean) → void`;
`list_recurrence_cancellations(target_shop_id uuid) → (series_id uuid, customer_name text, customer_phone text, barber_name text, service_name text, interval_weeks smallint, requested_at timestamptz)` (owner: all; barber: own series).

- [ ] **Step 1: Failing pgTAP** `040_plan_change_cancel.sql`, ids `f7…`, seed as `038_conflict_resolution.sql` (owner, barber user + barber, two customer users, shop, service, barber_service, working periods weekdays **1–7**, `conf_dates(monday, tuesday, wednesday)` temp table; plans weekly `'Corte mensal'` (2500) and every-2-weeks `'Quinzenal'` (3000)):
  1. customer A subscribes weekly (Monday 10:00); the barber accepts (series S1 active).
  2. A requests a change `request_recurrence(bs, 2, tuesday, '11:00', S1, null)` → lives and **S1 is still active**.
  3. the barber accepts it → S1 inactive with `ended_at`, and `count(*)` of S1's future `scheduled` appointments = 0; 4. the new series (2 weeks) is active.
  5. A requests a plan for Wednesday 14:00 (pending R3), then again with `target_replaces_request_id => R3` for Wednesday 15:00 → R3 `cancelled`, exactly one pending request.
  6. customer B `request_recurrence(..., target_replaces_series_id => S2)` throws `P0015`.
  7. A `request_series_cancellation(S2)` lives and sets `cancel_requested_at`; 8. a second call throws `P0037`; 9. B calling it throws `P0037`.
  10. the owner's inbox has a `recurrence_cancel_requested` row (scope by `user_id` of the test owner and `kind`); 11. `list_recurrence_cancellations(shop)` has 1 row for the owner and 1 for the barber, 0 for customer A.
  12. the barber declines → flag cleared and S2 active; 13. `decide_series_cancellation(S2, true)` while not requested throws `P0038`; request again, accept → S2 ended and its future appointments cancelled; A's inbox has `recurrence_cancel_accepted`.
  Run `npm run test:db` → `040` FAILS.
- [ ] **Step 2: Migration.** Part A (static):

```sql
alter table public.recurrence_requests add column replaces_series_id uuid references public.recurrence_series (id) on delete set null;
alter table public.recurrence_series add column cancel_requested_at timestamptz;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'appointment_awaiting_confirmation', 'appointment_booked', 'appointment_confirmed', 'appointment_cancelled', 'appointment_rescheduled',
  'recurrence_requested', 'recurrence_accepted', 'recurrence_rejected',
  'recurrence_cancel_requested', 'recurrence_cancel_accepted', 'recurrence_cancel_declined'));

alter table public.notification_outbox drop constraint notification_outbox_event_type_check;
alter table public.notification_outbox add constraint notification_outbox_event_type_check check (event_type in (
  'appointment.booked', 'appointment.cancelled', 'appointment.rescheduled', 'appointment.reminder', 'recurrence.conflict',
  'appointment.confirmed', 'staff.awaiting_confirmation', 'staff.booked', 'staff.cancelled', 'staff.rescheduled',
  'recurrence.requested', 'recurrence.accepted', 'recurrence.rejected',
  'recurrence.cancel_requested', 'recurrence.cancel_accepted', 'recurrence.cancel_declined'));

drop function public.list_my_recurrence_requests();
create function public.list_my_recurrence_requests()
returns table (
  id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
  barber_name text, service_name text, recurrence_cents integer,
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
  join public.barbers b on b.id = r.barber_id
  join public.barber_services bs on bs.id = r.barber_service_id
  join public.services s on s.id = bs.service_id
  left join public.recurrence_series rs on rs.id = r.series_id
  order by r.created_at desc limit 20;
$$;
revoke all on function public.list_my_recurrence_requests() from public, anon;
grant execute on function public.list_my_recurrence_requests() to authenticated;

create function public.request_series_cancellation(target_series_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  cust public.customers%rowtype;
  bs public.barber_services%rowtype;
  owner_user uuid;
  barber_user uuid;
  params jsonb;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  select * into cust from public.customers where id = series_row.customer_id and user_id = auth.uid();
  if not found or not series_row.active or series_row.cancel_requested_at is not null then
    raise exception using errcode = 'P0037', message = 'RECURRENCE_CANCEL_NOT_ALLOWED';
  end if;

  update public.recurrence_series set cancel_requested_at = clock_timestamp(), updated_at = clock_timestamp() where id = series_row.id;

  select * into bs from public.barber_services where id = series_row.barber_service_id;
  select owner_user_id into owner_user from public.shops where id = series_row.shop_id;
  select user_id into barber_user from public.barbers where id = bs.barber_id;
  params := jsonb_build_object('customer_name', cust.full_name, 'interval_weeks', series_row.interval_weeks,
    'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(barber_user, 'recurrence_cancel_requested', params, format('reccancelreq:%s:%s', series_row.id, barber_user), 'recurrence.cancel_requested');
  if owner_user is distinct from barber_user then
    perform public.add_inbox_event(owner_user, 'recurrence_cancel_requested', params, format('reccancelreq:%s:%s', series_row.id, owner_user), 'recurrence.cancel_requested');
  end if;
end;
$$;

create function public.decide_series_cancellation(target_series_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  bs public.barber_services%rowtype;
  customer_user uuid;
  params jsonb;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found then raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND'; end if;
  select * into bs from public.barber_services where id = series_row.barber_service_id;
  if not (public.is_shop_owner(series_row.shop_id) or public.is_own_barber(bs.barber_id)) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if series_row.cancel_requested_at is null or not series_row.active then
    raise exception using errcode = 'P0038', message = 'RECURRENCE_CANCEL_NOT_REQUESTED';
  end if;

  if accept then
    update public.appointments set status = 'cancelled', updated_at = clock_timestamp()
    where recurrence_series_id = series_row.id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed');
    update public.recurrence_series set active = false, ended_at = clock_timestamp(), cancel_requested_at = null, updated_at = clock_timestamp() where id = series_row.id;
  else
    update public.recurrence_series set cancel_requested_at = null, updated_at = clock_timestamp() where id = series_row.id;
  end if;

  select user_id into customer_user from public.customers where id = series_row.customer_id;
  params := jsonb_build_object('interval_weeks', series_row.interval_weeks, 'service_name', (select name from public.services where id = bs.service_id));
  perform public.add_inbox_event(customer_user, case when accept then 'recurrence_cancel_accepted' else 'recurrence_cancel_declined' end, params,
    format('reccanceldec:%s:%s', series_row.id, clock_timestamp()), case when accept then 'recurrence.cancel_accepted' else 'recurrence.cancel_declined' end);
end;
$$;

create function public.list_recurrence_cancellations(target_shop_id uuid)
returns table (series_id uuid, customer_name text, customer_phone text, barber_name text, service_name text, interval_weeks smallint, requested_at timestamptz)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select rs.id, c.full_name, c.phone, b.name, s.name, rs.interval_weeks, rs.cancel_requested_at
  from public.recurrence_series rs
  join public.customers c on c.id = rs.customer_id and c.shop_id = rs.shop_id
  join public.barber_services bs on bs.id = rs.barber_service_id
  join public.barbers b on b.id = bs.barber_id
  join public.services s on s.id = bs.service_id
  where rs.shop_id = target_shop_id and rs.active and rs.cancel_requested_at is not null
    and (public.is_shop_owner(target_shop_id) or public.is_own_barber(bs.barber_id))
  order by rs.cancel_requested_at;
$$;

revoke all on function public.request_series_cancellation(uuid), public.decide_series_cancellation(uuid, boolean),
  public.list_recurrence_cancellations(uuid) from public, anon;
grant execute on function public.request_series_cancellation(uuid), public.decide_series_cancellation(uuid, boolean),
  public.list_recurrence_cancellations(uuid) to authenticated;
```
Part B — re-create the two functions with a Python script appended to the migration (as done for `0053`/`0056`):

```bash
python3 - <<'EOF'
# request_recurrence: copy from 0053, new signature (two optional "replaces" params), validations, insert column.
src = open("supabase/migrations/0053_recurrence_plans.sql").read()
a = src.index("create or replace function public.request_recurrence(")
b = src.index("\n$$;", a) + 4
fn = src[a:b]
fn = fn.replace("create or replace function public.request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time)",
  "create function public.request_recurrence(target_barber_service_id uuid, target_interval_weeks integer, target_start_date date, target_start_time time,\n  target_replaces_series_id uuid default null, target_replaces_request_id uuid default null)", 1)
marker = "  select timezone, owner_user_id into tz, owner_user from public.shops where id = bs.shop_id;\n"
assert fn.count(marker) == 1
guard = """  if target_replaces_series_id is not null and not exists (
    select 1 from public.recurrence_series s where s.id = target_replaces_series_id and s.customer_id = cust.id and s.active
  ) then
    raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
  end if;
  if target_replaces_request_id is not null then
    update public.recurrence_requests set status = 'cancelled', decided_at = clock_timestamp()
    where id = target_replaces_request_id and customer_id = cust.id and status = 'pending';
    if not found then
      raise exception using errcode = 'P0015', message = 'RECURRENCE_INVALID';
    end if;
  end if;
"""
fn = fn.replace(marker, guard + marker, 1)
old_ins = "insert into public.recurrence_requests (shop_id, customer_id, barber_id, barber_service_id, interval_weeks, local_start_date, local_start_time)\n  values (bs.shop_id, cust.id, bs.barber_id, bs.id, target_interval_weeks, target_start_date, target_start_time)"
assert fn.count(old_ins) == 1
fn = fn.replace(old_ins, "insert into public.recurrence_requests (shop_id, customer_id, barber_id, barber_service_id, interval_weeks, local_start_date, local_start_time, replaces_series_id)\n  values (bs.shop_id, cust.id, bs.barber_id, bs.id, target_interval_weeks, target_start_date, target_start_time, target_replaces_series_id)")

# decide_recurrence_request: copy from 0050; accepting ends the replaced series first.
src50 = open("supabase/migrations/0050_recurrence_requests.sql").read()
a = src50.index("create function public.decide_recurrence_request(")
b = src50.index("\n$$;", a) + 4
dec = src50[a:b].replace("create function", "create or replace function", 1)
anchor = "  if accept then\n"
assert dec.count(anchor) == 1
ending = anchor + """    if req.replaces_series_id is not null then
      update public.appointments set status = 'cancelled', updated_at = clock_timestamp()
      where recurrence_series_id = req.replaces_series_id and starts_at > clock_timestamp() and status in ('scheduled', 'confirmed');
      update public.recurrence_series set active = false, ended_at = clock_timestamp(), cancel_requested_at = null, updated_at = clock_timestamp()
      where id = req.replaces_series_id and active;
    end if;
"""
dec = dec.replace(anchor, ending, 1)

with open("supabase/migrations/0058_plan_change_and_cancellation.sql", "a") as m:
    m.write("\n-- Requests can replace a series or a pending request; the old request_recurrence signature goes away.\n")
    m.write("drop function public.request_recurrence(uuid, integer, date, time);\n\n")
    m.write(fn + "\n")
    m.write("revoke all on function public.request_recurrence(uuid, integer, date, time, uuid, uuid) from public, anon;\n")
    m.write("grant execute on function public.request_recurrence(uuid, integer, date, time, uuid, uuid) to authenticated;\n\n")
    m.write("-- Accepting a change ends the series it replaces, in the same transaction.\n" + dec + "\n")
EOF
```
  (Check the `request_recurrence` text copied from `0053` really contains the quoted marker/insert strings — the asserts fail loudly if not; adjust the strings to match the file.)
- [ ] **Step 3: Apply and run**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0058_plan_change_and_cancellation.sql 2>&1 | grep -i error
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0058','plan_change_and_cancellation') on conflict do nothing"
npm run test:db 2>&1 | grep -v NOTICE | grep -A8 "040_\|031_"
```
Expected `040 … ok`; `031` keeps working (it uses the 4-argument `request_recurrence`, which still resolves through the defaults).
- [ ] **Step 4: Clean-DB check** (isolated stack, see Global Constraints): `040`, `039`, `038`, `034` pass there.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(db): replace-a-plan requests and cancellation requests"`

---

### Task 2: Client API, notifications plumbing, plan offers

**Files:**
- Create: `src/features/recurrence/plan-offers.ts`, `tests/unit/recurrence-plan-offers.test.ts`, `tests/unit/recurrence-cancellation-api.test.ts`
- Modify: `src/features/recurrence/requests-api.ts`, `src/features/recurrence/api.ts` if needed, `src/lib/errors/domain-errors.ts`, `src/features/notifications/inbox-api.ts` (kinds), `supabase/functions/dispatch-notifications/messages.ts`, `src/i18n/locales/{en,pt,es}.ts`, `tests/unit/notification-messages.test.ts`, `tests/unit/inbox.test.ts`, `tests/unit/recurrence-display-status.test.ts`, `tests/unit/recurrence-requests-api.test.ts`

**Produces:**
```ts
// plan-offers.ts
export type PlanOfferBarber = { avatarUrl: string | null; barberId: string; barberName: string; barberServiceId: string };
export type PlanOffer = { barbers: PlanOfferBarber[]; name: string; normalCents: number; planId: string; priceCents: number; serviceName: string; weeks: number };
export function buildPlanOffers(barbers: { avatarUrl: string | null; id: string; name: string }[], plansByBarber: Record<string, BarberPlan[]>): PlanOffer[]
// requests-api.ts
RecurrenceRequest += { cancelRequestedAt: string | null }
requestDisplayStatus → "active" | "cancel_requested" | "cancelled" | "ended" | "pending" | "rejected"   (accepted + active series + cancelRequestedAt ⇒ "cancel_requested")
SeriesInput += { replacesRequestId?: string; replacesSeriesId?: string }          // requestRecurrence only
requestSeriesCancellation(supabase, seriesId): Promise<void>                      // rpc request_series_cancellation { target_series_id }
type CancellationRequest = { barberName: string; customerName: string; customerPhone: string | null; requestedAt: string; seriesId: string; serviceName: string; weeks: number }
listCancellationRequests(supabase, shopId): Promise<CancellationRequest[]>        // rpc list_recurrence_cancellations { target_shop_id }
decideSeriesCancellation(supabase, seriesId, accept): Promise<void>               // rpc decide_series_cancellation { target_series_id, accept }
```

- [ ] **Step 1: Failing tests.**
  - `recurrence-plan-offers.test.ts`: two barbers B1 (`b1`, "Bia") and B2 ("Caio"); plans: B1 `p-month` (service "Cut", weeks 1, 2500, barberServiceId `bs1`) and `p-combo` ("Cut + Beard", weeks 1); B2 `p-month` (`bs2`). `buildPlanOffers` returns two offers sorted by `serviceName` then `weeks`; `p-month` lists both barbers in the barbers' order with their `barberServiceId`s; a barber with no plans appears nowhere; an empty input → `[]`.
  - `recurrence-cancellation-api.test.ts`: `requestSeriesCancellation` → rpc `request_series_cancellation { target_series_id: "s1" }`; `P0037` rejects with `RECURRENCE_CANCEL_NOT_ALLOWED`; `listCancellationRequests` maps rows (`series_id, customer_name, customer_phone, barber_name, service_name, interval_weeks, requested_at`); `decideSeriesCancellation(…, true)` → `decide_series_cancellation { accept: true, target_series_id: "s1" }`; `P0038` rejects with `RECURRENCE_CANCEL_NOT_REQUESTED`.
  - `recurrence-requests-api.test.ts`: `requestRecurrence` with `replacesSeriesId: "s1", replacesRequestId: "r1"` adds `target_replaces_series_id: "s1", target_replaces_request_id: "r1"` (and sends `null` for both when absent); the list mapper maps `cancel_requested_at` → `cancelRequestedAt`.
  - `recurrence-display-status.test.ts`: accepted + active + `cancelRequestedAt` set → `"cancel_requested"`; the helper's argument type gains `cancelRequestedAt`.
  - `notification-messages.test.ts`: `recurrence.cancel_requested|accepted|declined` build in en/pt/es (titles: "Plan cancellation requested" / "Cancelamento de plano solicitado" / "Cancelación de plan solicitada"; "Plan cancelled" / "Plano cancelado" / "Plan cancelado"; "Cancellation declined" / "Cancelamento recusado" / "Cancelación rechazada"); frequency text for 3 weeks reads "every 3 weeks" / "a cada 3 semanas" / "cada 3 semanas" (today anything other than 2 prints weekly: fix).
  - `inbox.test.ts`: `inboxRoute("recurrence_cancel_requested", "owner")` → `/monthly-customers`, `"barber"` → `/my-profile/recurrence`, and the customer kinds → `/me/recurrence`.
  Run → FAIL.
- [ ] **Step 2: Implement.**
  - `plan-offers.ts`: group by `planId` keeping the first plan's data; push `{ avatarUrl, barberId, barberName, barberServiceId }` per barber in input order; sort `a.serviceName.localeCompare(b.serviceName) || a.weeks - b.weeks`.
  - `requests-api.ts` and `domain-errors.ts` (`P0037 → RECURRENCE_CANCEL_NOT_ALLOWED` "You cannot request the cancellation of this plan.", `P0038 → RECURRENCE_CANCEL_NOT_REQUESTED` "No cancellation was requested.").
  - `inbox-api.ts`: add the three kinds to `InboxKind`. `messages.ts`: replace `FREQUENCY` with a function `frequency(language, weeks)` (1 → weekly, 2 → every 2 weeks, N → "every N weeks" / "cada N semanas" / "a cada N semanas") and add the three `EXTENDED` entries (body `${c.customer} · ${c.service} · ${c.frequency}` for requested, `${c.service} · ${c.frequency}` for the two customer ones).
  - Locales: `errors.codes` for P0037/P0038 (pt "Você não pode solicitar o cancelamento deste plano." / "Nenhum cancelamento foi solicitado."; es "No puedes solicitar la cancelación de este plan." / "No se solicitó ninguna cancelación."), `notifications.recurrence_cancel_requested|accepted|declined` (`title`/`body` with the same placeholders as the existing `recurrence_*` entries: requested `{{customerName}} · {{serviceName}} · {{label}}`, accepted/declined `{{serviceName}} · {{label}}`), `recurrence.status.cancel_requested` ("Cancellation requested" / "Cancelamento solicitado" / "Cancelación solicitada"), `recurrence.status.active` (same text as `accepted`: "Active" / "Ativo" / "Activo").
- [ ] **Step 3: Run** — `npx jest` and `npx tsc --noEmit` → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: plan offers, change/cancellation api, notification kinds"`

---

### Task 3: Customer flow, vertical weekdays, bottom bar

**Files:**
- Create: `src/components/domain/BottomActionBar.tsx`, `src/features/recurrence/customer-flow/WeekdayList.tsx`, `tests/e2e/plan-change.web.spec.ts`
- Modify: `app/(customer)/me/recurrence.tsx`, `src/components/domain/index.ts`, `tests/e2e/recurrence-request.web.spec.ts`, `src/i18n/locales/{en,pt,es}.ts`

**Interfaces — Produces:**
```tsx
BottomActionBar(props: { children: ReactNode; testID?: string })        // absolute bottom, safe-area padding, surface background, top border; renders children in a column
WeekdayList(props: { dates: Record<number, string>; disabledDays: number[]; onSelect: (day: number) => void; selectedDay: number | null })   // rows testID weekday-<n>, caption recurrence.noTimesWeekday when disabled
```
Strings: `recurrence.steps` is rewritten (`plan, barber, weekday, time, review, send`), `recurrence.changePlan` ("Change plan" / "Alterar plano" / "Cambiar plan"), `recurrence.requestCancellation` ("Request cancellation" / "Solicitar cancelamento" / "Solicitar cancelamiento"), `recurrence.cancelDialogTitle`/`cancelDialogBody` ("Request cancellation?" / "The shop will confirm it. Your plan stays active until then." — pt "Solicitar cancelamento?" / "A loja vai confirmar. Seu plano continua ativo até lá." — es "¿Solicitar cancelamiento?" / "La tienda lo confirmará. Tu plan sigue activo hasta entonces."), `recurrence.cancelRequested` toast ("Cancellation requested." / "Cancelamento solicitado." / "Cancelamento solicitado." → es "Cancelación solicitada."), `recurrence.changeSent` ("Change requested. Your current plan stays until it is confirmed." / pt "Troca solicitada. Seu plano atual continua até a confirmação." / es "Cambio solicitado. Tu plan actual sigue hasta la confirmación."), `recurrence.history` ("History" / "Histórico" / "Historial"), `recurrence.chooseBarber` reused for the barber step, `recurrence.currentPlan` ("Your plan" / "Seu plano" / "Tu plan").

- [ ] **Step 1: Failing e2e.** Rewrite the flow test in `recurrence-request.web.spec.ts` and add `plan-change.web.spec.ts` (mock helpers as in the current spec: `mockCustomerRest`, `signInAsCustomer`, `list_recurrence_plans_for_barber` per barber, `get_available_slots`, `list_my_recurrence_requests`, `request_recurrence`, `request_series_cancellation`, `cancel_my_recurrence_request`, public barbers/shops as in `customer-helpers`):
  - **Plan first:** no current plan → the top `recurrence-request` button exists and `plans-bottom-bar` does not; step label "Step 1 of 6 · Plan"; `offer-<planId>` cards show title, per-session price, 4-week total (when whole) and regular price; choosing one → "Step 2 of 6 · Barber" listing only barbers that offer it (`offer-barber-<id>`); a barber who does not offer that plan is absent; then "Step 3 of 6 · Day" with `weekday-1..7` stacked **one under the other** (assert each row's `boundingBox().y` increases and `x`/`width` are equal), a disabled day shows "No times on this day"; time, review (contains the plan title, barber, "Every Monday", price), send → `request_recurrence` body has no replaces values (`target_replaces_series_id: null`, `target_replaces_request_id: null`).
  - **Current plan (active):** the list shows the plan card with "Active"; `recurrence-request` (top) is **not** rendered; `plans-bottom-bar` is rendered with `plan-change`; the card has `plan-cancel-request` which opens `confirm-dialog`; confirming sends `{ target_series_id }` and the card turns "Cancellation requested" without the button.
  - **Change:** `plan-change` starts the flow at the plan step; sending posts `target_replaces_series_id: <series>`; toast `Change requested…`; the current plan card is still shown as Active.
  - **Pending current plan:** `plan-change` + send posts `target_replaces_request_id: <request>`; the old pending card has its own cancel-request button (existing `my-request-cancel-<id>`).
  - **History:** ended/rejected/cancelled requests are listed below under "History", greyed, never counted as current (top button visible when only history exists).
  Run (Expo restarted) → FAIL.
- [ ] **Step 2: Implement.**
  - `BottomActionBar`: `View` with `className="absolute bottom-0 left-0 right-0 border-t border-neutral-200 bg-surface px-5 pb-4 pt-3"`, inner `max-w-[420px] w-full self-center gap-2`; uses `useSafeAreaInsets().bottom` for padding. The scroll content gets `contentContainerStyle={{ paddingBottom: 120 }}` when the bar is shown.
  - `WeekdayList`: for day 1–7 a `Pressable` row (`min-h-[56px] w-full flex-row items-center justify-between rounded-xl border px-4`, weekday name from `owner.schedule.weekdays.*`, the next date as `formatDateNumeric` in a tabular-nums text, selected row `border-primary-400 bg-primary-50`, disabled row `opacity-50` with the caption), `testID={`weekday-${day}`}`.
  - `recurrence.tsx`: `type Step = "list" | "plan" | "barber" | "weekday" | "time" | "review"`; state `offer`, `barber` (`PlanOfferBarber`), `weekday`, `startsAt`, `replacing: boolean`; `FLOW = ["plan","barber","weekday","time","review","send"]`; `offers` via `useQueries` over the public barbers (`listPlansForBarber`) → `buildPlanOffers`; `current = requests.find(r => ["pending","active","cancel_requested"].includes(requestDisplayStatus(r)))`, `history = the rest`; slot queries (`getAvailableSlotsQueryOptions`) keyed by `barber.barberId` + `barber.barberServiceId`; `send` mutation passes `replacesSeriesId`/`replacesRequestId` only when `replacing` (series for `active`/`cancel_requested`, request for `pending`) and shows `recurrence.changeSent` vs `recurrence.sent`; cancellation mutation `requestSeriesCancellation` with `ConfirmDialog`; list view per the Global Constraints (top `recurrence-request` button only when `!current`; `BottomActionBar` with `plan-change` only when `current`, and hidden outside the list step); the in-flow back (`goBack`) and step bar behaviour stay as they are.
  - Keep `StepBar` from `r2`; step labels from the new `recurrence.steps`.
- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/recurrence-request.web.spec.ts tests/e2e/plan-change.web.spec.ts tests/e2e/profile.web.spec.ts tests/e2e/back-navigation.web.spec.ts` → PASS; screenshots at 375px: plan step, barber step, vertical weekdays, current plan with the bottom bar (check the bar does not hide the last card).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: plan-first customer flow, vertical weekdays, change/cancel bottom bar"`

---

### Task 4: Staff handle cancellation requests

**Files:**
- Create: `src/features/recurrence/CancellationCard.tsx`, `tests/e2e/plan-cancellation-staff.web.spec.ts`
- Modify: `app/(owner)/monthly-customers.tsx`, `app/(barber)/my-profile/recurrence.tsx`, `src/i18n/locales/{en,pt,es}.ts`

**Interfaces — Produces:** `CancellationCard(props: { busy: boolean; onDecide: (accept: boolean) => void; request: CancellationRequest })` with test ids `cancellation-<seriesId>`, `cancellation-accept-<seriesId>`, `cancellation-decline-<seriesId>`, optional WhatsApp link like `RequestCard`. Strings: `recurrence.cancellationTitle` ("Cancellation requests" / "Pedidos de cancelamento" / "Solicitudes de cancelamiento"), `recurrence.acceptCancellation` ("Accept cancellation" / "Aceitar cancelamento" / "Aceptar cancelamiento"), `recurrence.keepPlan` ("Keep plan" / "Manter plano" / "Mantener plan"), `recurrence.cancellationAccepted` ("Plan cancelled." / "Plano cancelado." / "Plan cancelado."), `recurrence.cancellationDeclined` ("Plan kept." / "Plano mantido." / "Plan mantenido.").

- [ ] **Step 1: Failing e2e** `plan-cancellation-staff.web.spec.ts`: owner session — Pedidos tab shows pending requests first and, under the heading "Cancellation requests", `cancellation-<id>` with the customer, service and frequency; accept sends `decide_series_cancellation { accept: true, target_series_id }`, decline `{ accept: false … }` and the card disappears after the mocked list refresh; the empty state only shows when there are neither requests nor cancellations. Barber session (`/my-profile/recurrence`): same card from `list_recurrence_cancellations` (the barber's own). Run → FAIL.
- [ ] **Step 2: Implement.** `CancellationCard` mirrors `RequestCard` (customer name, `serviceName · barberName`, `recurrenceLabel(t, weeks)`, accept `variant="danger"`, decline outline). Both screens add a `useQuery(listCancellationRequests)` (key `["owner-recurrence-cancellations", shopId]` / `["barber-recurrence-cancellations", shopId]`), a `decideCancel` mutation that invalidates it plus `["owner-recurring"]`/`["owner-agenda"]` (owner) or `["barber-agenda"]` (barber), shows the toast, and render the section after the requests.
- [ ] **Step 3: Verify** — typecheck, lint, jest; restart Expo; `npx playwright test tests/e2e/plan-cancellation-staff.web.spec.ts tests/e2e/owner-recurring.web.spec.ts tests/e2e/barber-recurrence.web.spec.ts` → PASS; screenshot the owner Pedidos tab with a cancellation at 375px.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: owner and barber answer plan cancellation requests"`

---

### Task 5: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db` (+ clean-DB check), full web e2e (`--workers=2`, rerun failures if Expo dies); restore `.env.local`; push `feat-plan-change-cancel`; PR via `gh api` REST (base `main`). Merging is the user's decision.
