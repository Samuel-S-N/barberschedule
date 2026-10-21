# UX Overhaul (client / barber / owner) — Master Index

Source request: 2026-10-20 (pt-BR list, ~25 items). Split into 6 plans, each independently shippable as its own PR. **Execute in order; 1 first** (others consume its helpers).

## Decisions confirmed with the user (2026-10-20)

| Topic | Decision |
|---|---|
| Split | 6 separate plans |
| Notifications | Persisted in-app inbox (`notifications` table + trigger, unread badge, tap opens the relevant screen) **plus push** to barbers/owners (new events) and customers (confirmation). Recurrence-generated appointments never notify. |
| Recurrence | Frequencies: **weekly (7d) and biweekly (14d)** only. Customer requests; chosen barber **or** owner accepts. Owner sets per-service, per-frequency special price. Customers without an account: owner/barber create the series manually ("Adicionar manualmente"). |
| Date display | `pt`/`es`: `DD/MM/AAAA`; `en`: `YYYY-MM-DD`. Storage stays ISO `YYYY-MM-DD`. |
| Barber menu name | **"Disponibilidade"** (en: "Availability", es: "Disponibilidad"), containing: Working hours, Lunch break, **"Ausências"** (absences; the old "folgas"). |
| Owner → barber profile | Owner can edit the barber's **services & prices** and **compensation + activate/deactivate** (red). Name/photo/phone and hours are NOT owner-editable (not selected) — see Open Points. |
| Owner profile | Mirror client/barber profile: Meus dados + photo, Segurança (password), Idioma/privacidade/sobre, **and "Atender como barbeiro"** (owner also cuts hair: own hours/services). |

## Plans (all task-expanded; execute in this order, one branch + PR each, merge before starting the next)

| # | File | Branch | Scope |
|---|---|---|---|
| 1 | `2026-10-20-01-input-masks-and-nav-stack.md` | `feat-input-masks-nav-stack` | Visual masks (date, time, phone; no CPF — no such field exists), locale date format, back-navigation stack (`backBehavior="history"`). |
| 2 | `2026-10-20-02-notifications-inbox.md` | `feat-notifications-inbox` | Bell (top-left) on Home/barber/owner, `notifications` table + triggers, inbox screen with tap navigation, push for barber/owner (templates + token registration). Migration. |
| 3 | `2026-10-20-03-customer-booking-flow.md` | `feat-booking-checkout` | Wizard barber › service › date › time › checkout › confirm with a "Passo N de 6" step indicator; barber photo (needs column grant); "Agenda" title clip. Migration. |
| 4 | `2026-10-20-04-barber-side.md` | `feat-barber-availability` | "Disponibilidade" (hours + lunch + absences with conflict warning), client search X (`SearchInput`), clickable agenda card + WhatsApp/phone, "Salvar perfil" at end. 2 migrations. |
| 5 | `2026-10-20-05-owner-crud.md` | `feat-owner-management` | Agenda labels/title, FAB `+`, create/edit screens for barbers (profile) / services / customers, red "Desativar", back-stack audit. No migration. |
| 6 | `2026-10-20-06-recurrence-shop-owner-profile.md` | `feat-recurrence-requests` | Recurrence request/accept + recurrence prices, shop & schedule improvements, owner profile (+ "Atender como barbeiro"). 2 migrations. |

Dependencies: 2→(none besides 1), 3→1, 4→1, 5→1,2,4, 6→1,2,4,5. Migration numbers `0046`…`0051` are the ones used by the implementation PRs; keep them increasing in merge order.

Docs-only PR for the plans: `docs-ux-overhaul-plans`.

## Status: implemented (2026-10-21)

All six plans were executed as stacked PRs (each based on the previous branch, none merged yet): [#52](https://github.com/Samuel-S-N/barberschedule/pull/52) masks + nav stack, [#53](https://github.com/Samuel-S-N/barberschedule/pull/53) notifications, [#54](https://github.com/Samuel-S-N/barberschedule/pull/54) booking wizard, [#55](https://github.com/Samuel-S-N/barberschedule/pull/55) barber side, [#56](https://github.com/Samuel-S-N/barberschedule/pull/56) owner CRUD, [#57](https://github.com/Samuel-S-N/barberschedule/pull/57) recurrence + shop + owner profile. Migrations `0046`–`0051` are local only; redeploy the `dispatch-notifications` edge function.

### As built (differences from the task text in the plans)
- **Plan 1:** `DateInput` shows the typed text while it still matches the stored value and the formatted value when the parent changes it; the owner agenda ignores incomplete dates. `useBack(fallback)`; barber screens fall back to `/my-profile`/`/clients`.
- **Plan 2:** the role groups share one URL space (a unit test forbids duplicate URLs), so the screens are `/notifications` (customer), `/barber-notifications`, `/owner-notifications`; `NotificationBell` takes no props and navigates by role (`notificationsPath`). pgTAP file is `029_notifications_inbox.sql`.
- **Plan 3:** completed steps use `router.dismissTo`; the time step disables Continue when the picked time is no longer offered; page titles use `leading-[44px]`; `stale-slot-recovery` and `catalog_rls` tests were updated.
- **Plan 4:** `ContactLink` lives in `src/components/domain/`; pgTAP `030_barber_lunch_break.sql`, `026` updated for the phone change.
- **Plan 5:** shared hooks `useOwnerBarbers` / `useOwnerServiceCatalog`; deactivate is red on barber profile, service form and customer list.
- **Plan 6:** pgTAP `031`/`032`; owner-as-barber verified under RLS (no SECURITY DEFINER fallback needed); the old create/edit form of recurring customers was replaced by Requests / Active / Prices tabs plus "Add manually".
- **Known e2e caveat:** two `barber-booking` reminder specs fail between 23:45 and 00:00 (São Paulo) because they build an appointment 15 minutes ahead.

## Open points (resolved or still open)
1. **CPF**: dropped for now (no field exists). Add `formatCpf` + validation when a form needs it.
2. **Owner can't edit barber name/phone/photo/hours** by the current decision. Probably expected (barber owns their data), but confirm.
3. **Owner "Atender como barbeiro"** is the largest hidden item: owner needs a `barbers` row, availability, and appears in the booking picker. Plan 6 treats it as a toggle; if you want it later, drop that bullet.
4. `en` date test expected `MM/DD/YYYY`; Plan 1 changes it to ISO deliberately.
5. **14 days vs 15**: biweekly is every 2 weeks (14 days) so the weekday stays fixed and the existing engine (whole weeks) is reused. "15 days" would need an engine change.
6. **Agenda title** follows the view (Dia/Semana/Mês) instead of always "Agenda do dia".
7. **Agenda RPC phone**: Plan 4 exposes the customer phone on the barber agenda for every customer (was: account-less only), same data as the Clients tab.
8. **Owner as barber**: verified — the owner can insert a `barbers` row linked to their own user under RLS (resolved).
9. **Customer cannot self-cancel an active recurrence** (only pending requests); follow-up.
