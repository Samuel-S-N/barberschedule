# Plans without a planned end — design

Date: 2026-10-21.

A plan has **no end date**: it stays active until the barber of the plan or the owner ends it (or accepts the customer's cancellation request).

- **Database (`0059_plans_without_end.sql`)**: the optional `ends_on` is removed (column, the `edit_recurrence_series` parameter, the `ensure_recurrence_window` conditions, the `list_owner_recurrence_series` column). `end_recurrence_series` now also accepts the barber of the plan (`is_own_barber` of the plan's barber service); `list_my_recurrence_series()` lists the plans of the signed-in barber's own customers. The hourly materialisation job keeps extending the 90-day window for every active plan.
- **Barber screen** (`/my-profile/recurrence`): an **Active plans** section (customer, service, periodicity, first date, "no end date" note) with **Encerrar plano** and a confirmation dialog; ending cancels the future appointments. The customer's plan card also says it stays active until cancelled.
- **Not changed**: the customer still cannot end a plan herself; she asks, and the barber or owner accepts or declines.
