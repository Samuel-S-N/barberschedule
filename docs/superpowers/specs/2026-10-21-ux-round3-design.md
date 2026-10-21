# UX round 3 — design

Date: 2026-10-21. Follows `2026-10-21-ux-round2-design.md` (PRs #58–#63, unmerged; this work stacks on #63).

## Goals
1. One Profile pattern for client, barber and owner (client is the model): the same menu order and the same **Settings** and **Privacy and data** screens.
2. "Recorrência" becomes **Planos** for the client and the barber; a plan **must have a title**; the client **subscribes to an existing plan** and waits for confirmation.
3. Recurrence conflicts can be **rescheduled** or **dismissed**.
4. Notifications can be cleared (all, or one).
5. The toast after a booking no longer says "confirmed".
6. An owner who serves as a barber can see and operate their own barber agenda.

## Decisions (agreed with the user)
- **Customer flow stays** Barbeiro › Plano › Dia › Horário › Revisão › Enviar. Only wording changes: button "Assinar plano", status "Aguardando confirmação do plano".
- **Privacy and data** (all roles): Terms, **Download my data** (moved out of Settings), and **Delete account** for client and barber only. The owner sees a note instead (deleting would erase the shop). A barber can delete only without future open appointments or active recurrence series; the account is anonymised (barber row archived, `user_id` cleared), history stays.
- **Settings** holds only Language, for every role.
- **Notifications**: an **X** at the top-right of the screen asks for confirmation and deletes all; **long-press** on one notification opens a pop-up with **Delete**. Deleting is permanent (own rows only, through an RPC).
- **Toast copy**: "Agendado! Aguardando confirmação do barbeiro." (en "Booked! Waiting for the barber to confirm.", es "¡Agendado! Esperando la confirmación del barbero."). "Agendamento confirmado" stays only on the push/inbox event sent when the barber actually confirms.
- **Owner as barber**: on the owner Agenda, a **Loja | Minha agenda** switch appears only while "Atender como barbeiro" is on. "Minha agenda" is the barber agenda (day strip, summary, timeline, **Confirmar / Concluir / Faltou**, pop-up with WhatsApp / Ligar / Lembrar / Cancelar). It does not book from free slots (the owner has the existing "+ new appointment" flow) and has no customer-profile link.
- **Plan dates are blocked like a normal booking.** Accepting a plan creates real appointments (source `recurrence`) for the next 90 days (existing `materialize_shop_as_owner`), so those slots disappear from availability and normal bookings are rejected exactly as for any appointment. Customers can only book 30 days ahead (`BOOKING_DAYS_AHEAD`), well inside that window; the daily job keeps rolling it. A pgTAP test proves the slot disappears and a normal booking fails. The residual case (staff booking beyond 90 days that later collides) is exactly what the conflict list is for. A **pending** request holds nothing.
- **Conflicts**: **Remarcar** books the series' appointment at a new date/time chosen by the owner, linked to the series and to the conflicted occurrence (`recurrence_series_id`, `recurrence_occurrence_date` = the conflicted date), at the plan's price; the conflict becomes `resolved`. **Dispensar** marks it `resolved` with no appointment (that date is skipped). The nightly materialiser never recreates it (a conflict row exists). The list shows open first, resolved greyed. Barbers do not see conflicts (out of scope).

## Database (three migrations)
- `0054_account_and_notifications.sql`: `prepare_account_deletion` accepts `barber`; `export_my_data` adds `barbers`; `delete_notifications(target_ids uuid[] default null) → integer` (own rows only).
- `0055_plan_titles.sql`: backfill empty plan names with "<service> · <periodicity>", `name` NOT NULL with `btrim(name) <> ''`; `save_recurrence_plan` rejects a blank title with **P0034 `RECURRENCE_PLAN_NAME_REQUIRED`**.
- `0056_resolve_recurrence_conflict.sql`: `resolve_recurrence_conflict(target_conflict_id uuid, new_starts_at timestamptz default null) → void` (owner only; P0010 otherwise; P0012 not found; P0035 `RECURRENCE_CONFLICT_RESOLVED` when already resolved).
- Error codes free before this work: P0034, P0035 (P0033 is the last used).

## UI structure
- `src/features/account/ProfileSettingsScreen.tsx` and `PrivacyDataScreen.tsx` are the shared screens; the six route files are thin wrappers (`languageHref`, `role`).
- `ConfirmDialog` and `NotificationActionSheet` (components/domain) use `Modal`, like `AppointmentSheet`.
- `ScreenHeader` gets an optional `right` slot.
- The barber agenda body moves to `src/features/appointments/BarberAgenda.tsx` with `mode: "barber" | "owner"`; `app/(barber)/my-agenda.tsx` and the new hidden owner tab `app/(owner)/my-barber-agenda.tsx` both render it. `AgendaScopeSwitch` is shown on both owner agenda screens.
- `ROUTE_PARENTS`: `/my-barber-agenda` → `/agenda`.

## Delivery
Four stacked plans, each its own branch/PR on top of `feat-recurrence-plans`:
1. `r3-01` profile, privacy, toast copy, notification clearing (`feat-profile-notifications`)
2. `r3-02` plans: required title and subscribe wording (`feat-plan-titles`)
3. `r3-03` owner's own agenda (`feat-owner-own-agenda`)
4. `r3-04` conflict resolution and the plan-blocks-slots proof (`feat-conflict-resolution`)

## Testing
TDD per task; pgTAP for every migration; Playwright (mocked REST) per screen, with a 375px screenshot of each new screen; static scans (route parents, placeholders, label hints) keep passing.
