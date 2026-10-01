# Missing customer features — design

Date: 2026-10-01. Approved in chat by the product owner (design + order of work).

## Scope (7 items, one plan, independent tasks)

1. **Signup confirm-password.** Signup asks the password twice; mismatch is a field error (`auth.validation.passwordMismatch`).
2. **List failures have an exit.** A shared `ErrorRetry` (message + "Try again") replaces bare error text on Home, Agenda and the customer barber list; those screens get pull-to-refresh.
3. **Review summary.** `book/review` shows barber, service, duration, price and date above the time picker. Data comes from the shared `useBarberServices` hook (extracted from `book/service.tsx`) and `listPublicBarbers`.
4. **Reschedule shows the current appointment.** An `AppointmentCard` for the appointment being moved (found by `appointmentId` in the cached upcoming list) on top of `reschedule.tsx`.
5. **Shop info.**
   - DB (migration `0030_shop_info.sql`): `shops.address/phone/whatsapp` (nullable, publicly readable, owner-updatable) and `shop_hours(shop_id, weekday 1..7 ISO, start_time, end_time)`, publicly readable, no overlap per weekday. Writes only through `set_shop_hours(p_periods jsonb)` (owner only, replaces all rows atomically).
   - A day with no rows is closed. Start/end of the day is the first start / last end; **a break (lunch or any other pause) is a gap between two periods** of the same day. Pure helpers convert a draft `{open, start, end, breaks[]}` to periods and back.
   - Owner screen `app/(owner)/shop.tsx` (linked from owner settings): address/phone/WhatsApp + per-weekday Open toggle, start/end `HH:mm`, "Add break" (start/end, any number).
   - Customer: `ShopInfoCard` on Home (address, grouped weekly hours, Call / WhatsApp buttons via `Linking`: `tel:` and `https://wa.me/<digits>`). When cancel/reschedule is locked (<90 min) the Agenda shows the same contact buttons.
   - Hours are informational only; the availability engine still uses barber schedules (ADR 006). **No map for now** (decided in chat).
6. **History & calendar.** History items get "Book again" (→ `/book/date` with shop/barber/service prefilled). Upcoming items get "Add to calendar": `.ics` built by a pure function (UTC times, escaped text, CRLF), delivered with `expo-file-system` + `expo-sharing` on native and a download on web.
7. **Push.** `expo-notifications`; after customer bootstrap, a hook asks permission once, fetches the Expo token (projectId from `expo-constants`), calls the existing `saveExpoPushToken`. No-op on web/simulator. Android channel `default`. Real-device delivery stays a pending manual check.

## Non-goals
Map/geo, dated shop closures, deriving shop hours from barber schedules, changing availability, owner/barber-side UI beyond the shop editor.

## Conventions
TDD (jest unit tests in `tests/unit`, pgTAP in `supabase/tests`), all copy in en/pt/es locales (parity test), NativeWind `className` only on plain RN elements, verify UI in the browser (web), one commit per task on branch `feat-missing-features`.
