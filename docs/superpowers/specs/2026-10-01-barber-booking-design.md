# Barber booking from the agenda — design

Date: 2026-10-01. First of three barber-side specs (2: barber profile hub + extras, 3: reports with charts).

## Goal

A barber books appointments for themself, fast, from their own agenda: pick a day, tap a free slot, type the customer's name (the only required field; email and phone optional), pick a service, confirm. The customer may already have an account, may have none yet, or may be identified by name only.

## Decisions (agreed with the user)

- Entry point is the agenda: calendar strip (today or a future day) → timeline of the day → tap a free slot → bottom sheet → confirm. No separate "+" screen.
- Only `name` is required. `email` and `phone` are optional.
- Email links accounts: a customer with an account sees the appointment in their agenda; a customer without one sees it once they sign up with the same (verified) email.
- Email is unique per shop among customers. `auth.users` already guarantees one account per email.
- Local Supabase only for the test barber user; nothing touches the hosted project.

## Backend (migration `0031_barber_booking.sql`)

1. `alter type appointment_source add value 'barber'`.
2. Relax `customers_contact_present` so a customer may have only a name (barber walk-ins). New check: `email is not null or phone is not null or user_id is not null or anonymized_at is not null or created_by_barber_id is not null`. Add `customers.created_by_barber_id uuid references barbers(id)` so the relaxation only applies to barber-created rows.
3. Unique index `customers_shop_email_key on customers (shop_id, lower(email)) where email is not null`. The migration first fails loudly if duplicates exist; the local seed has none.
4. `barber_find_or_create_customer(full_name text, email text default null, phone text default null) returns customers`
   - `security definer`, caller must satisfy `is_own_barber` for their active barber row; shop = that barber's shop.
   - Normalises: trims, `lower(email)`, phone to digits only (kept as typed digits, no DDI rewriting).
   - With an email: returns the existing shop customer with that email (never creates a duplicate). Otherwise, if `auth.users` has that email **and** `email_confirmed_at is not null`, creates the row with that `user_id` (or returns the shop customer already linked to that user). Otherwise creates an unlinked row.
   - Without an email: always creates a new row (names alone cannot be deduplicated; the recents list reduces this).
   - Archived (inactive) matches raise `CUSTOMER_UNAVAILABLE`.
5. `barber_search_customers(term text) returns table(id, full_name, email, phone, has_account)`: customers who have at least one appointment with the calling barber, matched by name/email/phone (`ilike`), plus the barber's 8 most recent clients when `term` is empty. Barbers get no direct `select` on `customers`.
6. Extend `book_appointment_internal`: source `'barber'` requires `is_own_barber(target.barber_id)` (a barber books only on their own services); like `owner`, it skips the one-booking-per-day limit. `book_appointment` wrapper unchanged (it already forwards any non-recurrence source). The barber books with `book_appointment(barber_service_id, customer_id, starts_at, 'barber', notes)`.
7. Claim on signup: `ensure_my_customer` first looks for a customer in the shop with `user_id is null` and `lower(email) = lower(account_email)`, **only if** `auth.users.email_confirmed_at is not null`, and sets its `user_id` (plus fills `full_name` only if it was blank); otherwise it inserts as today. Hosted projects must keep email confirmation on for the claim to be safe; unconfirmed accounts never claim.
8. Owner can already edit `customers`; completing a missing email there makes the next signup/login claim work (claim also runs from `ensure_my_customer`, which the customer app calls on each bootstrap).

Error codes reused: `SLOT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `CUSTOMER_UNAVAILABLE`, `BOOKING_FORBIDDEN`, `INVALID_BOOKING_START`. New: `CUSTOMER_NAME_REQUIRED` (`P0016`), `CUSTOMER_EMAIL_INVALID` (`P0017`).

## Front

- `src/features/appointments/barber-booking.ts`: `findOrCreateCustomer`, `searchMyCustomers`, `bookAsBarber` (find-or-create then `book_appointment` with source `'barber'`), plus `normalizePhone`, `parseBarberBookingInput` (zod-free, matching `validation.ts` style).
- `AppointmentSource` gains `'barber'`.
- `src/features/appointments/day-slots.ts`: pure `buildDaySlots(appointments, blocks, slots)` merging available start times (computed with the barber's **shortest** service), booked appointments and blocks into one ordered timeline. Free slots are the tap targets.
- `my-agenda.tsx`: add the day timeline under the calendar strip. A free slot opens `BarberBookingSheet`.
- `src/components/domain/BarberBookingSheet.tsx`: name (required, with autocomplete from `barber_search_customers`), email, phone, service picker (pre-selected most used; services that do not fit the slot are disabled with a reason), recent-client chips, a muted "no email: the customer will not see this in the app" hint, Confirm button. Uses `Input`/`useFieldChain`, `Button`, `Card`, `KeyboardAwareScrollView`; strings in i18n pt and en.
- On success: Toast, invalidate `barber-agenda`, close sheet. On `SLOT_UNAVAILABLE`: message plus slot refetch.

## Customer side

No new screen. The appointment belongs to the customer's row, so it already shows in `/appointments` once `customers.user_id` is set.

## Testing

- pgTAP `supabase/tests/017_barber_booking.sql`: barber books own slot with a name-only customer; with an existing-account email (linked); with an unknown email (unlinked); duplicate email returns the same row; barber A cannot book barber B's service; customer role cannot call the RPCs; claim on signup with confirmed email links and keeps the appointment; claim does **not** happen with an unconfirmed email; search returns only that barber's clients; unique email index; name-only row rejected when not barber-created; one-per-day limit does not apply to barbers.
- Jest: validation, phone normalisation, `buildDaySlots`, API error mapping, sheet component behaviour.
- Playwright e2e: log in as the test barber, book a name-only customer from a free slot, see it in the agenda.
- Browser check (screenshots + computed CSS), per the project's verify-UI rule.

## Out of scope

Barber profile hub, reports and charts (specs 2 and 3), recurring bookings by barbers, editing customers from the barber side, WhatsApp/notification sending to unlinked customers.

## Test data

`barber@teste.com` / `barber1234`, created only in local Supabase, with a **new** barber row (not a seed barber). Added to `supabase/seed.sql` so `db reset` recreates it.
