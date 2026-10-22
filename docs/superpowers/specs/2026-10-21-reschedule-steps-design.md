# Reschedule as a step-by-step flow — design

Date: 2026-10-21.

## Goal
"Remarcar" follows the booking wizard: **Data › Horário › Revisão (checkout) › Confirmar**, with the step bar on top. Applies to the customer's reschedule (`/reschedule`) and the barber's move (`/move-appointment`). The owner conflicts "Remarcar" pop-up is out of scope (user decision).

## Today
Both screens are one page: a large title, the current appointment, the month calendar, the times of the chosen day and a Confirm button together; no step bar, no review.

## Decisions
- **One shared component**, `RescheduleFlow` (`src/features/appointments/RescheduleFlow.tsx`), used by both screens. The routes stay the same, the steps are a **local trail** (like the plans flow), so no new routes and no new `ROUTE_PARENTS` entries.
- **Steps** `date, time, review, confirm`, labels Data/Horário/Revisão/Confirmar (en Date/Time/Review/Confirm), rendered with the existing `StepBar` and the existing `book.stepOf` text ("Step 2 of 4 · Time"). As in the booking wizard, "Confirmar" is the button of the Review step, not a screen. Completed steps are tappable to go back.
- **Date**: the month calendar (default today) + **Continue**, as in booking. The current appointment card is shown above the calendar, so the person sees what is being moved.
- **Time**: the free times of the chosen day (skeleton / empty state / load error as today) + **Continue**, disabled until a time is picked. Times show `HH:MM`.
- **Review (checkout)**: a summary card (service, barber for the customer / customer for the barber, **Current** date and time, **New** date and time), then **Confirmar remarcação** (`<prefix>-confirm`) and **Manter horário** (`<prefix>-keep`).
- **Header**: `ScreenHeader` with the back arrow replaces the loose title. Back goes one step back; on the first step it exits (customer: parent via `useBack`; barber: the agenda, as before). The Android hardware back still goes to the fixed parent (as in the other multi-step screens).
- **Errors**: if the time was just taken, the flow returns to the **Time** step with the error toast, the stale choice cleared and the slots refetched.
- **No database or API change**: `rescheduleAppointment` is unchanged.

## Test ids
`reschedule-*` (customer) / `move-*` (barber): `-current` (the card on the Date step), `-continue`, `-summary`, `-confirm`, `-keep`; step bar `step-indicator`, `step-<key>`, `step-label`.

## Testing
Unit: the existing `reschedule-current` static test follows the card to its new place. E2E: a new spec for the steps (customer and barber: labels in order, calendar then times then review with current and new, back one step, first-step back exits, taken time returns to the Time step, keep makes no call) and the three existing move tests and the customer reschedule test updated for the extra Continue/Review steps. 375px screenshots of each step.
