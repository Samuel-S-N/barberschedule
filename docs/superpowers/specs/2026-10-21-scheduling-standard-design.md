# One scheduling standard — design

Date: 2026-10-21. Follows `2026-10-21-reschedule-steps-design.md` (merged, #74).

## Goal
Every place where staff or customers **schedule** something uses the same step-by-step flow as booking: a step bar on top, **calendar › times › review**, instead of typed dates/times, "load times" buttons or pop-ups.

## Audit (what exists)
| Surface | Today | Verdict |
|---|---|---|
| Customer booking `/book/*` | steps, calendar, times, review | reference |
| Customer reschedule, barber move | steps (since #74) | done |
| Customer plan subscription | steps, weekday list, times | done (weekday instead of calendar: it is a recurrence) |
| **Owner "Novo agendamento"** `/appointment-form` | one form: typed date + "Carregar horários" + slot buttons | **change** |
| **Manual recurrence** (owner and barber) | inline card with typed date and time | **change** |
| **Conflict "Remarcar"** (owner) | pop-up with typed date + slots | **change** |
| Barber quick booking from a free slot on the agenda | pop-up opened from the tapped free slot | keep (quick action; date and time already chosen on the agenda) |
| Working hours, lunch, time off, shop closing, revenue and agenda date filters, "cancel occurrence" date | typed `DateInput`/`TimeInput` | keep (configuration and filters, not scheduling) |

## Decisions
1. **Shared steps.** `DateStep` (month calendar + Continue) and `TimeStep` (free times + Continue, includes the availability query) are extracted from `RescheduleFlow` into `src/features/availability/steps.tsx`; `RescheduleFlow` uses them and takes the final action as a **`submit`** prop (no longer hard-wired to `rescheduleAppointment`), plus optional `initialDate`, `currentLabel` and `currentTitle` so it also serves the conflict.
2. **Conflict "Remarcar"** becomes the route `/conflict-reschedule` (owner, hidden tab, parent `/recurrence-conflicts`) running `RescheduleFlow` with `submit = resolveRecurrenceConflict`. It starts on the conflicted date; the review's "Current" row is the **conflicted date**. The conflicts screen shows "Rescheduled." through a `done` param, like the barber's `moved`. The pop-up component is deleted.
3. **Owner "Novo agendamento"** keeps the route; steps **Cliente › Serviço › Data › Horário › Revisão › Confirmar**. Tapping a customer or a service row moves on (as the barber choice does in booking). The review has the summary, the notes field and **Criar agendamento**. The "Serviço" list stays "Barbeiro · Serviço". A taken time returns to the Time step with the error. Success goes to the agenda, which shows "Appointment created." through a `created` param.
4. **Manual recurrence** (staff) becomes two hidden routes sharing one component, `ManualRecurrenceFlow`: owner `/recurrence-manual` (parent `/monthly-customers`), barber `/my-profile/recurrence-manual` (parent `/my-profile/recurrence`). Steps **Cliente › Plano › [Barbeiro] › Dia › Horário › Revisão › Enviar**: the Barber step exists whenever the shop has more than one barber (so the step bar never changes length mid-flow); it lists only the barbers who offer the chosen plan. The barber role has just themself, so no step. Plans come from `list_recurrence_plans_for_barber` per barber and are merged with `buildPlanOffers`. Days are the weekday list with free times (first date = next occurrence of that weekday), as in the customer's flow; the review shows the plan value card (`PlanSummary`). "Add manually" becomes a button to the route; `ManualRecurrenceForm` is deleted. The weekday availability queries move to a shared hook used by the customer flow too.
5. **No database or API changes.** The existing RPCs (`resolve_recurrence_conflict`, `book_owner_appointment`, `create_recurrence_for_customer`) are reused as they are.

## Out of scope
Barber quick booking from the agenda; configuration and filter date/time fields; the owner/barber agenda navigation.

## Test ids
Prefix per surface: `conflict-` (`-continue`, `-summary`, `-confirm`, `-keep`), `owner-` for the new appointment (`owner-customer-<id>`, `owner-service-<id>`, `owner-continue`, `owner-summary`, `owner-form-create`, `owner-form-notes`), `manual-` for recurrence (`manual-customer-<id>`, `offer-<planId>`, `offer-barber-<id>`, `weekday-<n>`, `manual-continue`, `manual-summary`, `manual-recurrence-save`). The step bar ids are the shared `step-indicator`, `step-<key>`, `step-label`.

## Delivery
Three branches, each from `main` and carrying the previous ones' commits (each PR is against `main`; merge in order): `feat-conflict-steps` (shared steps + conflict), `feat-owner-booking-steps`, `feat-manual-recurrence-steps`. TDD, 375px screenshots, CI watched per PR.
