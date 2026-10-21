# Plan Titles and "Planos" Wording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A plan always has a title ("Corte mensal", "Corte + Barba mensal"); the client menu and the barber menu say **Planos**; the client **subscribes to a plan** and sees "Aguardando confirmação do plano" until it is accepted.

**Architecture:** Migration `0055` backfills and enforces the title and makes `save_recurrence_plan` reject a blank one (`P0034`). `planTitle` becomes the title itself. Only strings and the owner form change on the client side; the request flow (Barbeiro › Plano › Dia › Horário › Revisão › Enviar) is unchanged.

**Tech Stack:** Postgres/pgTAP, Expo Router, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-ux-round3-design.md`

## Global Constraints
- Branch `feat-plan-titles` from `feat-profile-notifications`. Migration `0055`, pgTAP `036_plan_titles.sql`; the existing `034`/`031` pgTAP files keep passing (they pass a name or are updated here).
- Error code **P0034 `RECURRENCE_PLAN_NAME_REQUIRED`** (add to `src/lib/errors/domain-errors.ts` and `errors.codes` in en/pt/es).
- Title: required, trimmed, max 60 characters, no uniqueness rule (two active plans for the same service and periodicity are still forbidden, as before).
- Wording: menu item and screen title "Planos" / "Plans" / "Planes" for the client (`profile.menu.recurrence`, `recurrence.title`) and the barber (`barber.hub.menu.recurrence`); button "Assinar plano"; pending status "Aguardando confirmação do plano".
- Test ids unchanged: `plan-name` (now required), `plan-save`, `plan-card-<planId>`, `recurrence-request`.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Use `rtk`; verify at 375px; Expo restart before e2e (`/tmp/claude-1000/restart.sh`).

---

### Task 1: Database — title required

**Files:** Create `supabase/migrations/0055_plan_titles.sql`, `supabase/tests/036_plan_titles.sql`; modify `supabase/tests/034_recurrence_plans.sql`, `supabase/tests/031_recurrence_requests.sql`.

- [ ] **Step 1: Failing pgTAP** `036_plan_titles.sql` (plan(4)), same seed style as `034` (owner, shop, service, customer): (1) `save_recurrence_plan(null, service, 1, 2500, null, true)` throws `P0034`; (2) `'   '` throws `P0034`; (3) `'Corte mensal'` lives; (4) `list_recurrence_plans(shop)` returns `name = 'Corte mensal'`. In `034` and `031` replace every `save_recurrence_plan(null, …, null, true)` (name = `null`) by a title (`'Weekly'`, `'Biweekly'`, `'Test'`) so those files keep passing. Run `npm run test:db` → `036` FAILS.
- [ ] **Step 2: Migration** `0055_plan_titles.sql`:

```sql
-- Existing plans without a title get "<service> · Weekly / Every N weeks".
update public.recurrence_plans p
set name = s.name || ' · ' || case p.interval_weeks when 1 then 'Semanal' when 2 then 'Quinzenal' else 'A cada ' || p.interval_weeks || ' semanas' end
from public.services s
where s.id = p.service_id and (p.name is null or btrim(p.name) = '');

alter table public.recurrence_plans alter column name set not null;
alter table public.recurrence_plans add constraint recurrence_plans_name_not_blank check (btrim(name) <> '' and char_length(name) <= 60);
```
then re-create `save_recurrence_plan` (copy it from `0053_recurrence_plans.sql` with `create or replace`): add, before the `P0032` check,

```sql
  if target_name is null or btrim(target_name) = '' then
    raise exception using errcode = 'P0034', message = 'RECURRENCE_PLAN_NAME_REQUIRED';
  end if;
```
and use `btrim(target_name)` (no `nullif`) in the insert and update. `list_recurrence_plans` returns `p.name`, so its `name text` column is now never null; leave its signature.
- [ ] **Step 3: Apply and run**

```bash
docker exec -i supabase_db_barberschedule psql -U postgres -d postgres -q < supabase/migrations/0055_plan_titles.sql 2>&1 | grep -i error
docker exec supabase_db_barberschedule psql -U postgres -d postgres -qc "insert into supabase_migrations.schema_migrations (version,name) values ('0055','plan_titles') on conflict do nothing"
npm run test:db 2>&1 | grep -v NOTICE | grep -A5 "03[146]_"
```
Expected `034 ok`, `036 ok`; `031` keeps only its two known dev-data failures.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(db): recurrence plans require a title"`

---

### Task 2: Client API and strings

**Files:** Modify `src/features/recurrence/plans-api.ts`, `src/lib/errors/domain-errors.ts`, `src/i18n/locales/{en,pt,es}.ts`, `tests/unit/recurrence-plans-api.test.ts`, `src/features/recurrence/ManualRecurrenceForm.tsx` (no change expected: it calls `planTitle`).

**Produces:** `RecurrencePlan.name: string` and `BarberPlan.name: string` (no longer nullable); `saveRecurrencePlan` input `name: string`; `planTitle(plan: { name: string }) → string` (drops the `t`, `serviceName` and `weeks` parameters). Update every caller (`grep -rn "planTitle(" app src tests`).

- [ ] **Step 1: Failing tests** — in `recurrence-plans-api.test.ts`: the "saves a plan" test passes `name: " Corte mensal "` and expects `target_name: "Corte mensal"` (create) and `"Corte + Barba"` (edit); the title test becomes `expect(planTitle({ name: "Trimestral" })).toBe("Trimestral")`; add `it("maps a missing title to RECURRENCE_PLAN_NAME_REQUIRED")` with `{ error: { code: "P0034" } }`. Run → FAIL.
- [ ] **Step 2: Implement** — `plans-api.ts`: types `name: string`; mapping `name: String(row.name)`; `target_name: input.name.trim()`; `export const planTitle = (plan: { name: string }) => plan.name;` (remove the unused `recurrenceLabel` import if nothing else uses it). `domain-errors.ts`: add `"RECURRENCE_PLAN_NAME_REQUIRED"` to the union and `case "P0034": return new DomainError("RECURRENCE_PLAN_NAME_REQUIRED", "Give the plan a title.");`.
- [ ] **Step 3: Strings** (en; pt/es after). Change the existing keys and add the new one:

```ts
// profile.menu
    recurrence: "Plans",
// barber.hub.menu
    recurrence: "Plans",
// recurrence block
    title: "Plans",
    request: "Subscribe to a plan",
    sent: "Plan requested. You will be notified when it is confirmed.",
    status: { accepted: "Active", cancelled: "Cancelled", pending: "Waiting for plan confirmation", rejected: "Declined" },
    empty: "You have no plans yet.",
// errors.codes
      RECURRENCE_PLAN_NAME_REQUIRED: "Give the plan a title.",
// owner.plans
    name: "Plan title",
    nameRequired: "Give the plan a title.",
```
pt: `recurrence: "Planos"` (both menus), `title: "Planos"`, `request: "Assinar plano"`, `sent: "Plano solicitado. Você será avisado quando for confirmado."`, status `{ accepted: "Ativo", cancelled: "Cancelado", pending: "Aguardando confirmação do plano", rejected: "Recusado" }`, `empty: "Você ainda não tem planos."`, `RECURRENCE_PLAN_NAME_REQUIRED: "Dê um título ao plano."`, `owner.plans.name: "Título do plano"`, `nameRequired: "Dê um título ao plano."`. es: `recurrence: "Planes"`, `title: "Planes"`, `request: "Suscribirse a un plan"`, `sent: "Plan solicitado. Te avisaremos cuando se confirme."`, status `{ accepted: "Activo", cancelled: "Cancelado", pending: "Esperando confirmación del plan", rejected: "Rechazado" }`, `empty: "Aún no tienes planes."`, `RECURRENCE_PLAN_NAME_REQUIRED: "Ponle un título al plan."`, `owner.plans.name: "Título del plan"`, `nameRequired: "Ponle un título al plan."`. Keep `recurrence.status` keys exactly as the existing object has them (`grep -n "status: { accepted" src/i18n/locales/en.ts`).
- [ ] **Step 4: Run** — `npx jest tests/unit/recurrence-plans-api.test.ts` then `npx tsc --noEmit` (fix every `planTitle` caller; the callers are `app/(owner)/recurrence-plans.tsx`, `app/(customer)/me/recurrence.tsx`, `src/features/recurrence/ManualRecurrenceForm.tsx`).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: plan title is required; Planos wording"`

---

### Task 3: Owner form requires the title; examples

**Files:** Modify `app/(owner)/recurrence-plan-form.tsx`, `app/(owner)/recurrence-plans.tsx`, `src/i18n/locales/{en,pt,es}.ts` (examples), `tests/e2e/owner-recurrence-plans.web.spec.ts`, `tests/e2e/recurrence-request.web.spec.ts`, `tests/e2e/barber-recurrence.web.spec.ts`, `tests/e2e/owner-recurring.web.spec.ts`, `tests/e2e/recurrence.web.spec.ts`.

- [ ] **Step 1: Failing e2e** — in `owner-recurrence-plans.web.spec.ts`: in the create test assert `plan-save` is disabled after picking the service, price and weeks (title still empty), then fill `plan-name` with `Barba trimestral` and expect enabled; the list asserts the card's first line is the title only (`Trimestral`; the weekly plan fixture gets `name: "Corte mensal"` and the expected text changes to `Corte mensal`). In the other specs update mocks so every plan row has a `name` (`"Corte mensal"` / `"Trimestral"`), replace `"Browser Cut · Weekly"` expectations by the title, and the wording ones (`"Recurrence"` title/`"Request recurrence"`/`"Awaiting reply"` → `"Plans"`/`"Subscribe to a plan"`/`"Waiting for plan confirmation"`). Run → FAIL.
- [ ] **Step 2: Implement** — the form: the `plan-name` `Input` moves to the first position under the service picker header (field chain index 0), label `owner.plans.name`, placeholder `t("examples.planTitle")`, and `valid` additionally requires `name.trim().length > 0`; show `owner.plans.nameRequired` under the field after the user touched it and left it empty. List card: first line `{plan.name}{plan.active ? "" : ` ${t("owner.plans.inactive")}`}`, second line `plan.serviceName · periodicity label` (`recurrenceLabel(t, plan.weeks)`). Examples: add `planTitle: "Corte mensal"` (en: "Monthly cut", es: "Corte mensual") to the `examples` block of the three locales and remove the now-unused `serviceName` placeholder from the plan form.
- [ ] **Step 3: Verify** — `npm run typecheck && npm run lint && npx jest`; restart Expo; `npx playwright test tests/e2e/owner-recurrence-plans.web.spec.ts tests/e2e/recurrence-request.web.spec.ts tests/e2e/barber-recurrence.web.spec.ts tests/e2e/owner-recurring.web.spec.ts tests/e2e/recurrence.web.spec.ts tests/e2e/profile.web.spec.ts tests/e2e/field-examples.web.spec.ts` → PASS. Screenshot the owner form and the customer plan step at 375px.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: owner plan form requires a title"`

---

### Task 4: Review and PR
- [ ] `npm run typecheck && npm run lint && npx jest`, `npm run test:db`, full web e2e (`--workers=3`); push `feat-plan-titles`; PR via `gh api` REST (base: `feat-profile-notifications`). Deploy note: migration `0055` (existing nameless plans get a generated title).
