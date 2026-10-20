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

## Plans

| # | File | Scope |
|---|---|---|
| 1 | `2026-10-20-01-input-masks-and-nav-stack.md` | Visual masks (date, time, phone, CPF), locale date format, back-navigation stack. **Written in full.** |
| 2 | `2026-10-20-02-notifications-inbox.md` | Bell (top-left) on Home/barber/owner, `notifications` table, triggers, inbox screen. |
| 3 | `2026-10-20-03-customer-booking-flow.md` | Booking wizard barber › service › date › time › checkout review › confirm; barber photo in picker; "Agenda" title clipped by "Próximos" button. |
| 4 | `2026-10-20-04-barber-side.md` | Availability menu (hours + lunch + absences) in profile; clients search clear (X); clickable agenda card w/ WhatsApp+phone; "Salvar perfil" at end of Meus dados. |
| 5 | `2026-10-20-05-owner-crud.md` | Agenda "Dia/Semana/Mês anterior/próximo" + title "Agenda do dia"; FAB "+" and create screens for barbers/services/customers; barber profile screen; red "Desativar"; clients search X. |
| 6 | `2026-10-20-06-recurrence-shop-owner-profile.md` | Recurring-customer request/accept flow + special prices; improvements to Manage › Schedule & Shop data/hours; owner profile. |

Plans 2–6 are **outlined below, not yet task-expanded**: each needs a short code-reading pass first (listed under "Pre-reads") so file paths/signatures are exact. Expand each one right before executing it.

## Outlines

### Plan 2 — Notifications inbox
- Pre-reads: `supabase/migrations/*notif*`, `src/features/notifications/*`, `src/components/domain/ScreenHeader.tsx`, `tests/integration/notifications.test.ts`.
- Migration `00NN_notifications_inbox.sql`: `notifications(id, user_id, kind, title_key, body_params jsonb, appointment_id, read_at, created_at)`; RLS select/update own rows only; `SECURITY DEFINER` trigger on `appointments` insert/update → rows for customer (confirmed, cancelled), barber (new, awaiting confirmation, cancelled), owner (same as barber, all barbers). Store i18n *keys + params*, never rendered text (language is per viewer).
- `src/features/notifications/inbox-api.ts`: `listNotifications`, `markRead`, `markAllRead`, `unreadCount`; Realtime subscription hook `useUnreadCount`.
- `NotificationBell` component (lucide `Bell`, badge) placed top-left in Home (customer), barber agenda, owner agenda; `/notifications` screen per role group.
- Tests: pgTAP/integration for RLS + trigger fan-out; unit for key→text mapping.

### Plan 3 — Customer booking flow
- Pre-reads: `app/(customer)/(tabs)/book/*.tsx`, `src/components/domain/BarberCard.tsx`, `Avatar.tsx`, `BookingSummary.tsx`, `app/(customer)/(tabs)/appointments.tsx`, `tests/e2e/booking.web.spec.ts`.
- Steps: order barber → service → date → time → **checkout** (new `book/checkout.tsx`: summary + price + confirm) → success. Today `review.tsx` mixes time selection and confirmation; split. Update step indicator and e2e.
- Photo: find why `BarberCard` doesn't show it (likely `photo_url` not selected in the list RPC/query or Avatar fallback); fix + unit test on mapping.
- Agenda title clipping: header row in `appointments.tsx` — descender of "g" cut by button (line-height / `items-center` / fixed height). Verify with computed CSS in browser (see memory *verify UI in a browser*).

### Plan 4 — Barber side
- Pre-reads: `app/(barber)/my-profile/{index,hours,account}.tsx`, `app/(barber)/clients/index.tsx`, `app/(barber)/my-agenda.tsx`, `src/features/barbers/api.ts`, `src/features/clients/format.ts`, migrations for time-off/blocks.
- Remove "Folgas" shortcut from barber home; new `my-profile/availability` (route group: hours, lunch, absences). Lunch break = daily recurring block `lunch_start/lunch_end` per barber (migration) honoured by `availability` slot generation (tests in `tests/integration/availability.test.ts`).
- Shared `SearchInput` (with clear X) in `src/components/ui/` — reused by Plan 5.
- Agenda card → pressable → opens client detail; buttons WhatsApp (`https://wa.me/55…`) + `tel:` reusing what `clients/[id].tsx` does (extract to `src/features/clients/contact-links.ts`).
- "Salvar perfil" button at the bottom of `my-profile/account.tsx` (single save, replaces inline saves).

### Plan 5 — Owner CRUD
- Pre-reads: `app/(owner)/{agenda,barbers,services,customers}.tsx`, `src/lib/i18n` keys `owner.agenda.previousRange/nextRange`, `danger` colour token in `src/lib/design/colors.ts`.
- Agenda: labels by view (Dia/Semana/Mês anterior|próximo); title `owner.agenda.title` → "Agenda do dia".
- Shared `FabAdd` (circular `+`, bottom-right, above tab bar).
- New routes `barbers/new`, `barbers/[id]`, `services/new`, `services/[id]`, `customers/new`; main lists become read-first (available barbers prominent), edit navigates to detail. "Desativar" uses `variant="danger"`.
- Owner barber detail: services/prices + compensation/active only (per decision).

### Plan 6 — Recurrence, shop settings, owner profile
- Pre-reads: `src/features/recurrence/*`, `app/(owner)/monthly-customers.tsx`, `app/(owner)/{schedule,shop}.tsx`, recurrence migrations.
- Migration: `recurrence_requests(customer_id, barber_id, barber_service_id, interval_days in (7,14), preferred_weekday/time, status pending|accepted|rejected)`; `service_recurrence_prices(service_id, interval_days, price_cents)`; accepting creates `recurrence_series` (existing) with `special_price_cents` looked up.
- Customer UI: "Pedir recorrência" from profile/home; barber + owner inbox of requests (accept/reject) — pushes notifications via Plan 2.
- Owner: price table per service × {weekly, biweekly} (e.g. Seed cut 35 → weekly 25; total shown for 4 weeks = 100).
- Shop/schedule improvements proposed: copy hours to all weekdays, weekday templates, holiday/closed-date list, validation hints with masks from Plan 1, shop contact data (WhatsApp, address) in one "Dados da barbearia" screen.
- Owner profile: clone `(barber)/my-profile` structure under `(owner)/my-profile`; "Atender como barbeiro" toggles an owner-linked `barbers` row.

## Open points to flag (not blocking Plan 1)
1. **CPF**: no CPF field exists anywhere (code or DB). Plan 1 ships `formatCpf` + tests but wires it to nothing (YAGNI). Tell me which form should collect CPF and whether it's required — it's personal data (LGPD): needs a column, RLS, and privacy-export inclusion.
2. **Owner can't edit barber name/phone/photo/hours** by the current decision. Probably expected (barber owns their data), but confirm.
3. **Owner "Atender como barbeiro"** is the largest hidden item: owner needs a `barbers` row, availability, and appears in the booking picker. Plan 6 treats it as a toggle; if you want it later, drop that bullet.
4. **Unrelated pre-existing breakage**: `main` has the en date test expecting `MM/DD/YYYY`; Plan 1 changes it to ISO deliberately.
