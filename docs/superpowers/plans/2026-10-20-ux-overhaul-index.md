# UX Overhaul (client / barber / owner) — Master Index

Source request: 2026-10-20 (pt-BR list, ~25 items). Split into 6 plans, each independently shippable as its own PR. **Execute in order; 1 first** (others consume its helpers).

## Decisions confirmed with the user (2026-10-20)

| Topic | Decision |
|---|---|
| Split | 6 separate plans |
| Notifications | Persisted in-app inbox (new `notifications` table + triggers, Realtime, unread badge). Existing push stays as-is. |
| Recurrence | Frequencies: **weekly (7d) and biweekly (14d)** only. Customer requests; chosen barber **or** owner accepts. Owner sets per-service, per-frequency special price. |
| Date display | `pt`/`es`: `DD/MM/AAAA`; `en`: `YYYY-MM-DD`. Storage stays ISO `YYYY-MM-DD`. |
| Barber menu name | **"Disponibilidade"** (en: "Availability", es: "Disponibilidad"), containing: Working hours, Lunch break, **"Ausências"** (absences; the old "folgas"). |
| Owner → barber profile | Owner can edit the barber's **services & prices** and **compensation + activate/deactivate** (red). Name/photo/phone and hours are NOT owner-editable (not selected) — see Open Points. |
| Owner profile | Mirror client/barber profile: Meus dados + photo, Segurança (password), Idioma/privacidade/sobre, **and "Atender como barbeiro"** (owner also cuts hair: own hours/services). |

## Plans (all task-expanded; execute in this order, one branch + PR each, merge before starting the next)

| # | File | Branch | Scope |
|---|---|---|---|
| 1 | `2026-10-20-01-input-masks-and-nav-stack.md` | `feat-input-masks-nav-stack` | Visual masks (date, time, phone, CPF helper), locale date format, back-navigation stack (`backBehavior="history"`). |
| 2 | `2026-10-20-02-notifications-inbox.md` | `feat-notifications-inbox` | Bell (top-left) on Home/barber/owner, `notifications` table + triggers, inbox screen. Migration. |
| 3 | `2026-10-20-03-customer-booking-flow.md` | `feat-booking-checkout` | Wizard barber › service › date › time › checkout › confirm; barber photo (needs column grant); "Agenda" title clip. Migration. |
| 4 | `2026-10-20-04-barber-side.md` | `feat-barber-availability` | "Disponibilidade" (hours + lunch + absences), client search X (`SearchInput`), clickable agenda card + WhatsApp/phone, "Salvar perfil" at end. 2 migrations. |
| 5 | `2026-10-20-05-owner-crud.md` | `feat-owner-management` | Agenda labels/title, FAB `+`, create/edit screens for barbers (profile) / services / customers, red "Desativar", back-stack audit. No migration. |
| 6 | `2026-10-20-06-recurrence-shop-owner-profile.md` | `feat-recurrence-requests` | Recurrence request/accept + recurrence prices, shop & schedule improvements, owner profile (+ "Atender como barbeiro"). 2 migrations. |

Dependencies: 2→(none besides 1), 3→1, 4→1, 5→1,2,4, 6→1,2,4,5. Migration numbers in plans (`0046`…`0051`) are placeholders: take the next free number when executing and keep them increasing in merge order.

Docs-only PR for the plans: `docs-ux-overhaul-plans`.

## Open points to flag (not blocking Plan 1)
1. **CPF**: no CPF field exists anywhere (code or DB). Plan 1 ships `formatCpf` + tests but wires it to nothing (YAGNI). Tell me which form should collect CPF and whether it's required — it's personal data (LGPD): needs a column, RLS, and privacy-export inclusion.
2. **Owner can't edit barber name/phone/photo/hours** by the current decision. Probably expected (barber owns their data), but confirm.
3. **Owner "Atender como barbeiro"** is the largest hidden item: owner needs a `barbers` row, availability, and appears in the booking picker. Plan 6 treats it as a toggle; if you want it later, drop that bullet.
4. `en` date test expected `MM/DD/YYYY`; Plan 1 changes it to ISO deliberately.
5. **14 days vs 15**: biweekly is every 2 weeks (14 days) so the weekday stays fixed and the existing engine (whole weeks) is reused. "15 days" would need an engine change.
6. **Agenda title** follows the view (Dia/Semana/Mês) instead of always "Agenda do dia".
7. **Agenda RPC phone**: Plan 4 exposes the customer phone on the barber agenda for every customer (was: account-less only), same data as the Clients tab.
8. **Owner as barber**: direct insert of a `barbers` row linked to the owner's user may be blocked by RLS; Plan 6 Task 11 says how to verify and fall back to a SECURITY DEFINER function.
9. **Customer cannot self-cancel an active recurrence** (only pending requests); follow-up.
