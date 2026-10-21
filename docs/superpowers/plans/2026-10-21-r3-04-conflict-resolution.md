# Recurrence Conflict Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can **Remarcar** (book that occurrence at a new date/time) or **Dispensar** (skip it) every recurrence conflict; resolved conflicts leave the open list. A pgTAP test also proves that a customer placed in a plan makes those dates unavailable exactly like a normal booking.

**Architecture:** Migration `0056` adds `resolve_recurrence_conflict` and extends `list_owner_recurrence_conflicts` with the barber and barber-service ids (needed to ask for free times). Remarcar books through `book_appointment_internal` as an owner booking, then re-labels the appointment as the series' occurrence for the conflicted date at the plan's price, so the nightly materialiser never recreates it. Dismiss only marks the conflict resolved (the conflict row already blocks re-creation). The screen gets two buttons per open conflict and a small reschedule sheet (date + free times).

**Tech Stack:** Postgres/pgTAP, Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round3-design.md`

## Global Constraints
- Branch `feat-conflict-resolution` from `feat-owner-own-agenda`. Migration `0056_resolve_recurrence_conflict.sql`, pgTAP `038_conflict_resolution.sql`.
- Error codes: **P0035 `RECURRENCE_CONFLICT_RESOLVED`** (new: add to `domain-errors.ts` and `errors.codes` of en/pt/es). Reused: P0010 forbidden, P0012 not found, P0001 slot unavailable, P0009 start in the past.
- Open conflicts first, resolved ones greyed with a "Resolved" badge and no buttons. Barbers do not see this screen.
- Test ids: `conflict-<id>`, `conflict-whatsapp-<id>`, `conflict-reschedule-<id>`, `conflict-dismiss-<id>`, sheet `conflict-sheet`, `conflict-sheet-date`, slot buttons by time text, `conflict-sheet-confirm`, `conflict-sheet-close`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `rtk`; verify at 375px; Expo restart before e2e (`/tmp/claude-1000/restart.sh`); apply migrations with `docker exec -i … psql < file.sql` plus a `schema_migrations` row.

---

### Task 1: Database (pgTAP first)

**Files:** Create `supabase/migrations/0056_resolve_recurrence_conflict.sql`, `supabase/tests/038_conflict_resolution.sql`.

**Produces (DB):** `list_owner_recurrence_conflicts(target_shop_id)` additionally returns `barber_id uuid, barber_service_id uuid`; `resolve_recurrence_conflict(target_conflict_id uuid, new_starts_at timestamptz default null) → void`.

- [ ] **Step 1: Failing pgTAP** `038_conflict_resolution.sql` (plan(10)), seed in the style of `034`: owner `fb…01`, barber user `fb…02` + barber row, customer user `fb…03` + customer, second customer `fb…04`, shop, service (30 min, 3500), barber_service, working periods for **every weekday** 09:00–18:00 (so any chosen date works), an active recurrence plan (`save_recurrence_plan(null, service, 1, 2500, 'Corte mensal', true)` as the owner). Use `date_trunc('week', current_date + 14)::date` Mondays as in `034` (temporary table `conf_dates(monday, next_monday)` granted to `authenticated`).
  1. *Plan blocks the date:* as customer `…03`, `request_recurrence(bs, 1, monday, '10:00')`; as the barber `decide_recurrence_request(<id>, true)`; then as customer `…04` assert `(select count(*) from get_available_slots(barber, monday, bs) where local_time = '10:00') = 0` (**the plan's date is no longer offered**) and 2. `book_appointment(...)` for `monday 10:00` throws `P0001` (**cannot be booked like any taken slot**); 3. the same slot **is** offered on the day before (control: `count = 1` at `monday - 1` is not valid if that day is closed; use a second Tuesday `10:00` that has no series and assert it is offered).
  4. *Conflict shows ids:* create a conflict row as the table owner (`insert into recurrence_conflicts (series_id, occurrence_date, reason) values (<series>, monday + 7, 'SLOT_UNAVAILABLE')`), then as the owner `list_owner_recurrence_conflicts(shop)` returns 1 row with `barber_id = <barber>` and `barber_service_id = bs`.
  5. *Reschedule:* as the owner `resolve_recurrence_conflict(<conflict>, (monday + 8 + time '11:00') at time zone <shop tz>)` lives (compute with `(select (( (monday + 8) + time '11:00') at time zone s.timezone) from shops s …)`); 6. the new appointment has `source = 'recurrence'`, `recurrence_occurrence_date = monday + 7` and `service_price_cents_snapshot = 2500`; 7. the conflict is `resolved` with `resolution_appointment_id` set.
  8. *Resolved twice* throws `P0035`. 9. *Dismiss:* a second conflict (`monday + 14`) with `resolve_recurrence_conflict(<id>)` becomes `resolved` with `resolution_appointment_id is null`. 10. *A customer cannot resolve:* as customer `…03` it throws `P0010`.
  Run `npm run test:db` → `038` FAILS.
- [ ] **Step 2: Migration** `0056_resolve_recurrence_conflict.sql`:

```sql
drop function public.list_owner_recurrence_conflicts(uuid);

create function public.list_owner_recurrence_conflicts(target_shop_id uuid)
returns table (
  id uuid, series_id uuid, occurrence_date date, reason text, status public.recurrence_conflict_status,
  customer_name text, customer_phone text, service_name text, local_start_time time,
  barber_id uuid, barber_service_id uuid
)
language plpgsql stable security definer set search_path = pg_catalog, public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_shop_owner(target_shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;

  return query
  select
    recurrence_conflicts.id, recurrence_conflicts.series_id, recurrence_conflicts.occurrence_date,
    recurrence_conflicts.reason, recurrence_conflicts.status, customers.full_name, customers.phone,
    services.name, recurrence_series.local_start_time, barber_services.barber_id, barber_services.id
  from public.recurrence_conflicts
  join public.recurrence_series on recurrence_series.id = recurrence_conflicts.series_id
  join public.customers on customers.id = recurrence_series.customer_id and customers.shop_id = recurrence_series.shop_id
  join public.barber_services on barber_services.id = recurrence_series.barber_service_id and barber_services.shop_id = recurrence_series.shop_id
  join public.services on services.id = barber_services.service_id and services.shop_id = barber_services.shop_id
  where recurrence_series.shop_id = target_shop_id
  order by recurrence_conflicts.status, recurrence_conflicts.occurrence_date, recurrence_conflicts.id;
end;
$$;

revoke all on function public.list_owner_recurrence_conflicts(uuid) from public;
grant execute on function public.list_owner_recurrence_conflicts(uuid) to authenticated;

create function public.resolve_recurrence_conflict(target_conflict_id uuid, new_starts_at timestamptz default null)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  conflict public.recurrence_conflicts%rowtype;
  series public.recurrence_series%rowtype;
  new_id uuid;
begin
  select * into conflict from public.recurrence_conflicts where id = target_conflict_id for update;
  if not found then
    raise exception using errcode = 'P0012', message = 'APPOINTMENT_NOT_FOUND';
  end if;
  select * into series from public.recurrence_series where id = conflict.series_id;
  if auth.uid() is null or not public.is_shop_owner(series.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if conflict.status = 'resolved' then
    raise exception using errcode = 'P0035', message = 'RECURRENCE_CONFLICT_RESOLVED';
  end if;

  if new_starts_at is not null then
    select b.id into new_id
    from public.book_appointment_internal(series.barber_service_id, series.customer_id, new_starts_at, 'owner', null) b;

    -- The replacement is the series' occurrence for the conflicted date, at the plan's price.
    update public.appointments
    set source = 'recurrence', recurrence_series_id = series.id, recurrence_occurrence_date = conflict.occurrence_date,
        service_price_cents_snapshot = coalesce(series.special_price_cents, service_price_cents_snapshot)
    where id = new_id;
  end if;

  update public.recurrence_conflicts
  set status = 'resolved', resolved_at = clock_timestamp(), resolution_appointment_id = new_id
  where id = conflict.id;
end;
$$;

revoke all on function public.resolve_recurrence_conflict(uuid, timestamptz) from public, anon;
grant execute on function public.resolve_recurrence_conflict(uuid, timestamptz) to authenticated;
```
- [ ] **Step 3: Apply and run**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0056_resolve_recurrence_conflict.sql 2>&1 | grep -i error
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0056','resolve_recurrence_conflict') on conflict do nothing"
npm run test:db 2>&1 | grep -v NOTICE | grep -A8 "038_conflict"
```
Expected `038 … ok`. If the `book_appointment_internal` call fails for `'owner'` because the helper is not directly callable from this function, fix by checking its `revoke` (it is `from public`, but SECURITY DEFINER functions of the same owner can call it, as `materialize` does).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(db): resolve recurrence conflicts (reschedule or dismiss); plan dates block bookings"`

---

### Task 2: Client API, error code, strings

**Files:** Modify `src/features/recurrence/api.ts`, `src/features/recurrence/types.ts`, `src/lib/errors/domain-errors.ts`, `src/i18n/locales/{en,pt,es}.ts`; tests `tests/unit/recurrence-conflicts-api.test.ts` (new), existing conflict e2e mocks.

**Produces:** `RecurrenceConflict += { barberId: string; barberServiceId: string }`; `resolveRecurrenceConflict(supabase, input: { id: string; startsAt: string | null }): Promise<void>` calling `resolve_recurrence_conflict` with `{ target_conflict_id: id, new_starts_at: startsAt }`.

- [ ] **Step 1: Failing test** `recurrence-conflicts-api.test.ts`: `listOwnerRecurrenceConflicts` maps `barber_id`/`barber_service_id` to `barberId`/`barberServiceId`; `resolveRecurrenceConflict` calls the RPC with `new_starts_at: null` for a dismissal and with the ISO string for a reschedule; `{ error: { code: "P0035" } }` rejects with `code: "RECURRENCE_CONFLICT_RESOLVED"`. Run → FAIL.
- [ ] **Step 2: Implement** — mapping in `listOwnerRecurrenceConflicts`; new function next to it (use `toRecurrenceError`; extend `domain-errors.ts` with the union member and `case "P0035": return new DomainError("RECURRENCE_CONFLICT_RESOLVED", "This conflict was already resolved.");`).
- [ ] **Step 3: Strings.** `errors.codes.RECURRENCE_CONFLICT_RESOLVED`: en "This conflict was already resolved.", pt "Este conflito já foi resolvido.", es "Este conflicto ya fue resuelto.". In `owner.conflicts` replace `note` and add: en `note: "Open conflicts are dates the shop could not keep. Contact the customer, then reschedule that date or dismiss it."`, `reschedule: "Reschedule"`, `dismiss: "Dismiss"`, `dismissed: "Date skipped."`, `rescheduled: "Rescheduled."`, `resolved: "Resolved"`, `resolveError: "Unable to resolve the conflict."`, `sheetTitle: "Reschedule {{date}}"`, `sheetDate: "New date"`, `sheetTimes: "Free times"`, `sheetConfirm: "Confirm new time"`, `noTimes: "No free times on this date."`, `reasonSLOT_UNAVAILABLE: "The time was no longer free"`. pt: `note: "Conflitos abertos são datas que a loja não conseguiu manter. Fale com o cliente e remarque essa data ou dispense."`, `reschedule: "Remarcar"`, `dismiss: "Dispensar"`, `dismissed: "Data dispensada."`, `rescheduled: "Remarcado."`, `resolved: "Resolvido"`, `resolveError: "Não foi possível resolver o conflito."`, `sheetTitle: "Remarcar {{date}}"`, `sheetDate: "Nova data"`, `sheetTimes: "Horários livres"`, `sheetConfirm: "Confirmar novo horário"`, `noTimes: "Sem horários livres nesta data."`, `reasonSLOT_UNAVAILABLE: "O horário já não estava livre"`. es: `note: "Los conflictos abiertos son fechas que la tienda no pudo mantener. Habla con el cliente y reprograma esa fecha o descártala."`, `reschedule: "Reprogramar"`, `dismiss: "Descartar"`, `dismissed: "Fecha descartada."`, `rescheduled: "Reprogramado."`, `resolved: "Resuelto"`, `resolveError: "No se pudo resolver el conflicto."`, `sheetTitle: "Reprogramar {{date}}"`, `sheetDate: "Nueva fecha"`, `sheetTimes: "Horarios libres"`, `sheetConfirm: "Confirmar nuevo horario"`, `noTimes: "Sin horarios libres en esta fecha."`, `reasonSLOT_UNAVAILABLE: "El horario ya no estaba libre"`.
- [ ] **Step 4: Run** — `npx jest tests/unit/recurrence-conflicts-api.test.ts && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: resolve recurrence conflict client call and strings"`

---

### Task 3: Conflicts screen — Remarcar and Dispensar

**Files:**
- Create: `src/features/recurrence/ConflictRescheduleSheet.tsx`, `tests/e2e/owner-conflicts.web.spec.ts`
- Modify: `app/(owner)/recurrence-conflicts.tsx`, `tests/e2e/recurrence.web.spec.ts` (its conflict mock gains `barber_id`/`barber_service_id`)

**Interfaces — Produces:**
```tsx
ConflictRescheduleSheet(props: { barberId: string; barberServiceId: string; busy: boolean; conflictId: string; date: string; onClose: () => void; onConfirm: (startsAt: string) => void; visible: boolean })
```
(`date` is the conflicted occurrence date, used as the initial value of the date field.)

- [ ] **Step 1: Failing e2e** `owner-conflicts.web.spec.ts` (owner session, mocks `list_owner_recurrence_conflicts` with one open and one resolved conflict, `get_available_slots` returning one slot `local_time: "11:00:00"`, `resolve_recurrence_conflict` recording its body and flipping the mocked row to `resolved`): (a) the open card shows `conflict-whatsapp-<id>`, `conflict-reschedule-<id>`, `conflict-dismiss-<id>`; the resolved card shows the "Resolved" badge and none of them; (b) Dismiss sends `{ target_conflict_id, new_starts_at: null }` and the card turns resolved; (c) Reschedule opens `conflict-sheet`, the date field starts at the occurrence date, the free time `11:00` is a button, `conflict-sheet-confirm` stays disabled until a time is picked, then sends `new_starts_at` equal to that slot's `starts_at`; the sheet closes and the card is resolved; (d) with no free times the sheet shows "No free times on this date.". Run → FAIL.
- [ ] **Step 2: Implement.** `ConflictRescheduleSheet`: `Modal` like `AppointmentSheet`; `DateInput` (`testID="conflict-sheet-date"`, from `MaskedInputs`) holding the date; `useQuery` of `getAvailableSlots(supabase, { barberId, barberServiceId, localDate })` enabled when the date is a full valid date; `TimeSlotPicker` for the slots (free ones only), the selected slot's `startsAt` kept in state; confirm button `conflict-sheet-confirm` (disabled until a slot is selected). The screen: a `resolve` mutation (`resolveRecurrenceConflict`) that invalidates `["owner-recurrence-conflicts"]` and shows a success toast (`owner.conflicts.rescheduled` / `dismissed`) or the `resolveError` toast; the card shows `localized reason` (`owner.conflicts["reason" + reason]` with fallback to the raw reason), the date/time, and for `open` conflicts the three buttons (WhatsApp, Reschedule `variant="primary"`, Dismiss `variant="outline"`); resolved cards use `opacity-60` and a `StatusBadge`-style pill with `owner.conflicts.resolved`; the list is sorted by the RPC (open first). The "Remarcar" sheet opens with `date = conflict.occurrenceDate`.
- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/owner-conflicts.web.spec.ts tests/e2e/recurrence.web.spec.ts tests/e2e/owner-recurring.web.spec.ts` → PASS. Screenshot the screen and the sheet at 375px.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: reschedule or dismiss recurrence conflicts"`

---

### Task 4: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db`, full web e2e (`--workers=3`); restore `.env.local`; push `feat-conflict-resolution`; PR via `gh api` REST (base: `feat-owner-own-agenda`). Deploy note: migration `0056`. Restart the user's Metro on 8081 (skill `running-barberschedule-locally`).
