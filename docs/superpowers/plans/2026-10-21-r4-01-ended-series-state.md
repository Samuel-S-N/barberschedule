# Ended Series State and Reactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A series ended by staff shows as **Encerrado** to the customer (not "Ativo"); the owner screen splits **Ativos** and **Encerrados** and can **Reativar** an ended series, which restores its future occurrences.

**Architecture:** The ended state is derived from the series: `list_my_recurrence_requests` returns the series' state and the plan title; the client maps `accepted` + ended series to an "ended" display status. A new owner RPC `reactivate_recurrence_series` re-activates the series, restores the future appointments the *ending* cancelled (cancelled within 5 s before `ended_at`, no recurrence exception), turns taken slots into open conflicts (detaching the cancelled row so Remarcar can reuse the occurrence key) and tops up the 90-day window.

**Tech Stack:** Postgres/pgTAP, Expo Router, React Query, NativeWind, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round4-design.md`

## Global Constraints
- Branch `fix-ended-series-state` from `main` (docs branch `docs-ux-round4` is merged first or this branch is cut from it). Migration `0057_reactivate_and_series_state.sql`, pgTAP `039_reactivate_series.sql`.
- New error **P0036 `RECURRENCE_SERIES_NOT_ENDED`** (add to `src/lib/errors/domain-errors.ts` and `errors.codes` in en/pt/es).
- Do **not** restore Samuel's series or touch dev data.
- pgTAP must also pass on a clean database (CI): scope every count to the test's own ids. A scratch stack for that is described in Task 1 step 4.
- Test ids: owner `series-<id>`, `series-reactivate-<id>`, section headings by text "Active" / "Ended"; customer `my-request-<id>`, `my-request-status-<id>`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `rtk`; verify at 375px; Expo restart before e2e (`/tmp/claude-1000/restart.sh`; it moves `.env.local` aside, restore it at the end).

---

### Task 1: Database (pgTAP first)

**Files:** Create `supabase/migrations/0057_reactivate_and_series_state.sql`, `supabase/tests/039_reactivate_series.sql`.

**Produces (DB):** `list_my_recurrence_requests()` additionally returns `series_id uuid, series_active boolean, series_ended_at timestamptz, plan_name text`; `reactivate_recurrence_series(target_series_id uuid) → void`.

- [ ] **Step 1: Failing pgTAP** `039_reactivate_series.sql` (plan(9)); seed like `038_conflict_resolution.sql` (ids `f9…`): owner `…01`, barber user `…02`, customer user `…03` with customer `…`, a second customer user `…04`, shop, service (30 min), barber, barber_service, working periods for weekdays **1–7**, `conf_dates(monday)` temp table granted to `authenticated`; as owner `save_recurrence_plan(null, service, 1, 2500, 'Corte mensal', true)`; customer `request_recurrence(bs, 1, monday, '10:00')`; barber `decide_recurrence_request(<id>, true)`. Then:
  1. as the customer, `list_my_recurrence_requests()` → `series_active` is `true` and `plan_name = 'Corte mensal'` (assert as one text: `series_active::text || '/' || plan_name`).
  2. as the owner `cancel_recurrence_occurrence(<series>, monday + 14)` (an individually cancelled occurrence, makes a recurrence exception), then `end_recurrence_series(<series>)`.
  3. as the customer the list now says `series_active = false` and `series_ended_at is not null`.
  4. as the **customer** `reactivate_recurrence_series(<series>)` throws `P0010`.
  5. a second customer (`…04`, a plain `customer` role) books `monday + 7` at `10:00` for the same barber service with `book_appointment(...)` (the slot is free again after the ending): lives.
  6. as the owner `reactivate_recurrence_series(<series>)` lives.
  7. the series is active again and `ended_at is null`; the occurrence on `monday` (restored) has `status = 'scheduled'`.
  8. the occurrence at `monday + 14` (individually cancelled) is still `cancelled`; the date `monday + 7` (taken meanwhile) has an **open conflict** and the old cancelled row for that date no longer carries the series (`recurrence_series_id is null`).
  9. reactivating again throws `P0036`.
  Run `npm run test:db` → `039` FAILS (functions missing). Use `reset role` before reading tables that `authenticated` cannot read.
- [ ] **Step 2: Migration** `0057_reactivate_and_series_state.sql`:

```sql
drop function public.list_my_recurrence_requests();

create function public.list_my_recurrence_requests()
returns table (
  id uuid, status public.recurrence_request_status, interval_weeks smallint, local_start_date date, local_start_time time,
  barber_name text, service_name text, recurrence_cents integer,
  series_id uuid, series_active boolean, series_ended_at timestamptz, plan_name text
)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select r.id, r.status, r.interval_weeks, r.local_start_date, r.local_start_time, b.name, s.name,
         (select p.price_cents from public.service_recurrence_prices p where p.service_id = s.id and p.interval_weeks = r.interval_weeks),
         r.series_id, rs.active, rs.ended_at,
         (select pl.name from public.recurrence_plans pl where pl.service_id = s.id and pl.interval_weeks = r.interval_weeks order by pl.active desc, pl.created_at desc limit 1)
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

create function public.reactivate_recurrence_series(target_series_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
declare
  series_row public.recurrence_series%rowtype;
  appt record;
  tz text;
  local_today date;
begin
  select * into series_row from public.recurrence_series where id = target_series_id for update;
  if not found or auth.uid() is null or not public.is_shop_owner(series_row.shop_id) then
    raise exception using errcode = 'P0010', message = 'APPOINTMENT_FORBIDDEN';
  end if;
  if series_row.active or series_row.ended_at is null then
    raise exception using errcode = 'P0036', message = 'RECURRENCE_SERIES_NOT_ENDED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(format('recurrence:%s', series_row.shop_id), 0));
  select timezone into tz from public.shops where id = series_row.shop_id;
  local_today := (clock_timestamp() at time zone tz)::date;

  update public.recurrence_series set active = true, ended_at = null, updated_at = clock_timestamp() where id = series_row.id;

  -- Restore what the ending cancelled; leave individually cancelled occurrences and customer cancellations alone.
  for appt in
    select a.id, a.recurrence_occurrence_date
    from public.appointments a
    where a.recurrence_series_id = series_row.id and a.status = 'cancelled' and a.starts_at > clock_timestamp()
      and a.updated_at between series_row.ended_at - interval '5 seconds' and series_row.ended_at + interval '1 second'
      and not exists (select 1 from public.recurrence_exceptions e where e.series_id = series_row.id and e.occurrence_date = a.recurrence_occurrence_date)
    order by a.starts_at
  loop
    begin
      update public.appointments set status = 'scheduled', updated_at = clock_timestamp() where id = appt.id;
    exception when exclusion_violation then
      -- The slot was taken meanwhile: free the occurrence key (the cancelled row stays as plain history) and open a conflict.
      update public.appointments
      set source = 'owner', recurrence_series_id = null, recurrence_occurrence_date = null
      where id = appt.id;
      insert into public.recurrence_conflicts (series_id, occurrence_date, reason)
      values (series_row.id, appt.recurrence_occurrence_date, 'SLOT_UNAVAILABLE')
      on conflict (series_id, occurrence_date) do nothing;
    end;
  end loop;

  -- Dates beyond what was restored (and never materialised) are created as usual.
  perform public.ensure_recurrence_window(series_row.shop_id, local_today + 90);
end;
$$;
revoke all on function public.reactivate_recurrence_series(uuid) from public, anon;
grant execute on function public.reactivate_recurrence_series(uuid) to authenticated;
```
  (The `series_row.ended_at` used in the loop is the value read before the update, so the window is correct; keep the `select … for update` before the `update`.)
- [ ] **Step 3: Apply and run**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0057_reactivate_and_series_state.sql 2>&1 | grep -i error
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0057','reactivate_and_series_state') on conflict do nothing"
npm run test:db 2>&1 | grep -v NOTICE | grep -A8 "039_"
```
Expected `039 … ok`. The dev database has extra data, so also run the clean-DB check:
- [ ] **Step 4: Clean-database check (CI parity).** Start the isolated stack (`/tmp/claude-1000/cistack`, ports 565xx, symlinked to this repo's migrations/tests/seed; recreate it from the notes in `project_ux_overhaul.md` if missing: copy `supabase/config.toml` with `project_id = "ciscratch"` and every port +1000, symlink `migrations`, `tests`, `seed.sql`), then `cd /tmp/claude-1000/cistack && npx supabase start --workdir . -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,inbucket,realtime,storage-api` and `npx supabase test db --workdir .`. `039` must pass there; the `anon … cannot execute` failures in `001/005/007/010/013` appear only on this local image and are not a regression. Stop it afterwards: `npx supabase stop --workdir . --no-backup`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(db): series state for the customer and reactivate_recurrence_series"`

---

### Task 2: Client API, display status, strings

**Files:** Modify `src/features/recurrence/requests-api.ts`, `src/features/recurrence/api.ts` (reactivate), `src/lib/errors/domain-errors.ts`, `src/i18n/locales/{en,pt,es}.ts`; tests `tests/unit/recurrence-requests-api.test.ts`, new `tests/unit/recurrence-display-status.test.ts`.

**Produces:**
```ts
// requests-api.ts: RecurrenceRequest += { planName: string | null; seriesActive: boolean | null; seriesEndedAt: string | null; seriesId: string | null }
export type RequestDisplayStatus = "active" | "cancelled" | "ended" | "pending" | "rejected";
export function requestDisplayStatus(request: Pick<RecurrenceRequest, "seriesEndedAt" | "status">): RequestDisplayStatus
// api.ts
reactivateRecurrenceSeries(supabase, seriesId: string): Promise<void>   // rpc reactivate_recurrence_series { target_series_id }
```

- [ ] **Step 1: Failing tests.** `recurrence-display-status.test.ts`: `accepted` + `seriesEndedAt: null` → `"active"`; `accepted` + `seriesEndedAt: "2026-10-21T12:12:00Z"` → `"ended"`; `pending/rejected/cancelled` map to themselves. In `recurrence-requests-api.test.ts` extend the "maps my requests" expectations with the four new fields (`series_id`, `series_active`, `series_ended_at`, `plan_name` → `seriesId`, `seriesActive`, `seriesEndedAt`, `planName`; nulls stay null). A new test in the conflicts-api test file or a new `tests/unit/recurrence-reactivate.test.ts`: `reactivateRecurrenceSeries` calls `reactivate_recurrence_series` with `{ target_series_id: "s1" }`; `{ error: { code: "P0036" } }` rejects with `code: "RECURRENCE_SERIES_NOT_ENDED"`. Run → FAIL.
- [ ] **Step 2: Implement** — add the mapped fields in `listMyRecurrenceRequests`, `requestDisplayStatus`, `reactivateRecurrenceSeries` (uses `toRecurrenceError`), and in `domain-errors.ts` the union member plus `case "P0036": return new DomainError("RECURRENCE_SERIES_NOT_ENDED", "This plan is not ended.");`.
- [ ] **Step 3: Strings.** `errors.codes.RECURRENCE_SERIES_NOT_ENDED`: en "This plan is not ended.", pt "Este plano não está encerrado.", es "Este plan no está terminado.". `recurrence.status.ended`: en "Ended", pt "Encerrado", es "Terminado". Owner (`owner.recurring`): `activeSection` ("Active" / "Ativos" / "Activos"), `endedSection` ("Ended" / "Encerrados" / "Terminados"), `endedBadge` ("Ended" / "Encerrado" / "Terminado"), `reactivate` ("Reactivate" / "Reativar" / "Reactivar"), `reactivated` ("Plan reactivated." / "Plano reativado." / "Plan reactivado.").
- [ ] **Step 3b:** `npx tsc --noEmit` (fix callers) and `npx jest tests/unit/recurrence` → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: derived ended status for plan requests and reactivate client call"`

---

### Task 3: Screens

**Files:** Modify `app/(customer)/me/recurrence.tsx`, `app/(owner)/monthly-customers.tsx`; tests `tests/e2e/recurrence-request.web.spec.ts` (ended card), `tests/e2e/owner-recurring.web.spec.ts` (sections and reactivate).

- [ ] **Step 1: Failing e2e.**
  - Customer: a request `{ status: "accepted", series_id: "s1", series_active: false, series_ended_at: "2026-10-21T12:12:00Z", plan_name: "Corte mensal" }` renders `my-request-status-<id>` with "Ended", its title is `Corte mensal · <barber>` (plan name first, falling back to the service name), and no cancel button; with `series_ended_at: null` it says "Active".
  - Owner: with two series (one active, one ended) the **Active** tab shows the heading "Active" with the active card and the heading "Ended" below with the ended card; the ended card has the "Ended" badge and `series-reactivate-<id>` but **no** `series-deactivate-<id>`, `series-end-<id>` or `series-cancel-<id>`; clicking reactivate calls `rpc/reactivate_recurrence_series` with `{ target_series_id }` followed by `rpc/ensure_recurrence_window`? — no: the RPC already tops up the window, so assert only the one call, then the success toast "Plan reactivated.". Run (Expo restarted) → FAIL.
- [ ] **Step 2: Implement.** Customer screen: card title `${request.planName ?? request.serviceName} · ${request.barberName}`; status via `requestDisplayStatus` → `t(`recurrence.status.${status}`)` where `active` maps to the existing `accepted` label (add `recurrence.status.active` as an alias with the same text if the typed keys require it); ended/rejected/cancelled cards get `opacity-60`; the cancel button only for `pending`. Owner screen: split `data.series` into `active` and `ended` (`item.endedAt !== null` → ended); render a small heading (`text-xl font-display-semibold`) before each non-empty group; the ended card shows `owner.recurring.endedBadge` in place of the state text, only the **Reativar** button (`series-reactivate-<id>`, `change.mutate(() => reactivateRecurrenceSeries(supabase, item.id))`, success toast `owner.recurring.reactivated` via the existing `feedback`), and the "cancel occurrence"/"end"/"deactivate" buttons are not rendered.
- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/recurrence-request.web.spec.ts tests/e2e/owner-recurring.web.spec.ts tests/e2e/recurrence.web.spec.ts` → PASS; screenshot both screens at 375px.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: ended plans are shown as Encerrado, owner can reactivate"`

---

### Task 4: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db` (dev-DB noise aside, plus the clean-DB check of Task 1 step 4), full web e2e (`--workers=2`; if Expo dies near the end, restart and rerun only the failures); restore `.env.local`; push `fix-ended-series-state`; open the PR via `gh api` REST (base `main`). Merging is the user's decision.
