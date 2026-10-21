# UX round 4 — design

Date: 2026-10-21. Follows rounds 1–3 (all merged to `main`).

## Goals
1. A series ended by staff is visibly **ended**: the customer no longer sees it as "Ativo", and the owner can tell ended series apart and **reactivate** them.
2. The customer chooses **Plano › Barbeiro › Dia › Horário › Revisão › Enviar**; the weekdays are a **vertical list**.
3. Once the customer has a plan, the top "Assinar plano" button is gone; a **fixed bottom bar** offers **Alterar plano**, and each active plan offers **Solicitar cancelamento**.

## Origin
Samuel's weekly cut was ended by staff at 09:12 on 2026-10-21 (`end_recurrence_series`): the series became inactive and its 13 future appointments were cancelled, but the request kept `status = 'accepted'`, so the customer screen still said "Ativo" while the owner screen listed the series last, inside the "Ativos" tab, with only a small "Inativo" in the text. The series is **not** restored (user decision).

## Decisions (agreed with the user)
- **Ended state** is derived from the series, not stored on the request: `accepted` + series `ended_at` ⇒ shown as **Encerrado** (customer) / **Encerrado** badge (owner).
- **Owner screen**: two sections, **Ativos** then **Encerrados** (greyed, badge, **Reativar**). Reactivating restores the series and its future occurrences (below).
- **Reactivate** (`reactivate_recurrence_series`, owner only): sets the series active again; future appointments that the *ending* cancelled (cancelled within 5 s before `ended_at`, no recurrence exception) go back to `scheduled`; a date whose slot has been taken since becomes an open **conflict** (so Remarcar/Dispensar apply); finally the 90-day window is topped up for dates that have no appointment row. Appointments cancelled for other reasons (customer, per-occurrence cancel) stay cancelled.
- **Plan-first flow**: the plan list is built in the app by merging each barber's plans (`list_recurrence_plans_for_barber`, no new RPC). A plan card shows title, price per session, 4-week total when whole, regular price. After a plan, the barber step lists only the barbers who offer that plan's service (barber photo/name). Weekdays: one full-width row per day, Monday…Sunday, a disabled row (and caption) when that day has no free time.
- **Step bar**: `plan, barber, weekday, time, review, send` (labels "Plano, Barbeiro, Dia, Horário, Revisão, Enviar").
- **Current plan**: a customer is treated as having at most one current plan (the newest pending or active series/request). With a current plan: no top button; the plan card shows its state (**Aguardando confirmação do plano** / **Ativo** / **Cancelamento solicitado**); the bottom bar shows **Alterar plano**; an active plan shows **Solicitar cancelamento** (with a confirm dialog). Ended/cancelled/rejected requests are history, listed below in grey, and do not count as a current plan. Without a current plan the screen is as before (top button **Assinar plano**, no bottom bar).
- **Alterar plano** opens the same flow. Sending it creates a new request carrying `replaces_series_id` (current plan active) or `replaces_request_id` (current plan still pending). The current active plan **keeps running** until the barber/owner accepts the new request; accepting ends the old series (future appointments cancelled) in the same transaction, then creates the new one. A pending request that is replaced is cancelled atomically with the creation of the new one.
- **Solicitar cancelamento**: the customer asks; the series stays active with `cancel_requested_at` set; barber and owner get an inbox item and push (`recurrence_cancel_requested`); either can **accept** (the series ends, future appointments cancelled, customer notified `recurrence_cancel_accepted`) or **decline** (flag cleared, customer notified `recurrence_cancel_declined`). Pending cancellations appear in the **Pedidos** tab of the owner and of the barber (barber sees only their own).
- Frequency wording in push messages covers any N weeks ("a cada 3 semanas"), not only weekly/biweekly.

## Database (two migrations)
- `0057_reactivate_and_series_state.sql`: `list_my_recurrence_requests` returns `series_id, series_active, series_ended_at, plan_name`; `reactivate_recurrence_series(target_series_id uuid) → void`. Errors: **P0036 `RECURRENCE_SERIES_NOT_ENDED`** (reactivating something that is not ended).
- `0058_plan_change_and_cancellation.sql`: `recurrence_requests.replaces_series_id`; `recurrence_series.cancel_requested_at`; `request_recurrence(...)` re-created with `target_replaces_series_id uuid default null, target_replaces_request_id uuid default null`; `decide_recurrence_request` ends the replaced series on accept; `list_my_recurrence_requests` adds `cancel_requested_at`; `request_series_cancellation(uuid)`, `decide_series_cancellation(uuid, boolean)`, `list_recurrence_cancellations(uuid)`; notification kinds `recurrence_cancel_requested|accepted|declined` and push types `recurrence.cancel_requested|accepted|declined`. Errors: **P0037 `RECURRENCE_CANCEL_NOT_ALLOWED`** (series not active, not the customer's, or already requested), **P0038 `RECURRENCE_CANCEL_NOT_REQUESTED`**. (P0035 is the last code used before this round.)

## UI structure
- `src/features/recurrence/plan-offers.ts` — merge barbers' plans into plan-first offers.
- `src/features/recurrence/BottomActionBar.tsx` (in `components/domain`) — fixed bottom bar, safe-area aware, over the tab bar's space.
- The customer screen splits into `app/(customer)/me/recurrence.tsx` (state + list + flow router) and `src/features/recurrence/customer-flow/*` (steps) to keep files focused.
- `CancellationCard` for staff; the owner and barber Pedidos tabs render it.

## Delivery
Two stacked plans, each its own branch/PR on `main`:
1. `r4-01` ended state, reactivation, owner sections (`fix-ended-series-state`)
2. `r4-02` plan-first flow, vertical weekdays, bottom bar, change and cancellation requests (`feat-plan-change-cancel`)

## Testing
TDD; pgTAP per migration (`039`, `040`); Playwright (mocked REST) per screen with 375px screenshots; CI parity: run pgTAP also on a clean database (seed only) since CI uses one — scope every count to the test's own ids.
