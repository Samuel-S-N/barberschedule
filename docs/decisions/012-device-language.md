# 012 — App follows the device language

**Date:** 2026-09-25
**Status:** Accepted

## Context

All UI text was hard-coded in English, dates used fixed `en-US`/`en-GB` formatters, error messages were English strings, and push notifications sent the raw event code (for example `appointment.reminder`) as both title and body, in no language at all.

## Decisions

- **Languages:** Brazilian Portuguese (`pt`, the reference), English (`en`) and Spanish (`es`). Any other device language falls back to `en`. There is no in-app picker: the app follows the device and re-reads it when it returns to the foreground.
- **Stack:** `i18next` + `react-i18next` + `expo-localization`, initialised synchronously. `en.ts` is the source of truth; `pt` and `es` are typed from it, so a missing key fails to compile, and `locale-parity.test.ts` checks keys, `{{placeholders}}` and empty strings at runtime. Error-code groups use `satisfies Record<…Code, string>`.
- **Guard:** `tests/unit/no-hardcoded-text.test.ts` fails if a route or component has literal JSX text or a `label|placeholder|title|message|accessibilityLabel` string literal.
- **Time and money:** times are always 24h `HH:mm`; only weekday and month names follow the language. Prices stay `R$` (the shop's currency). Appointment times follow the shop timezone (`America/Sao_Paulo`), not the device (decision 002). Shop, barber and service names and notes are content and are not translated.
- **Errors:** `errorMessage(error, t, fallback)` reads the `code` of `DomainError`, `ScheduleError`, `AvailabilityError` and Supabase auth errors and looks it up in the resource groups; `RangeError` maps to "enter a valid date and time"; anything else shows the screen's translated fallback. The client-side working-period overlap check now carries the same `SCHEDULE_OVERLAPPING_PERIOD` code as the database error.
- **Legal text:** Portuguese is the reference text; English and Spanish are convenience translations and say so on the page. `TERMS_VERSION` is unchanged because the terms are the same.
- **Push notifications:** migration `0024` adds `notification_tokens.locale` (`en|pt|es`, default `en`), `register_notification_token` takes an optional locale (unsupported → `en`) and `claim_notification_batch` returns it. `supabase/functions/dispatch-notifications/messages.ts` is a pure module that builds title and body for the five event types in three languages, with times in the shop timezone; the function spreads its result into the Expo request instead of the raw code. The module is unit-tested from Jest.

## Verification notes

- The dispatcher was exercised end to end on 2026-09-25 with `supabase functions serve` against the local stack: a token registered with locale `pt` is stored as `pt`, the outbox event is claimed with that locale, the function imports `messages.ts` and calls Expo. Expo answered `DeviceNotRegistered` for the fake token, so the request format was accepted; the exact request body is covered by the unit tests, not observed on the wire. Repeat this check after changing the function (there is no Deno runner in the repo).
- Layout was checked in a browser at 360px in `pt-BR`, `es-ES` and `en-US` (login, signup, home, agenda with actions, profile, plus an owner screen in the e2e suite); no clipped or overflowing text.

## Known limitations / open items

- **Push registration is not wired into the app.** Nothing calls `registerNotificationToken`/`saveExpoPushToken` yet (there is no `expo-notifications` usage), so the language will only reach the server once registration exists. The client contract is ready.
- **Translation review:** Portuguese was written as the reference; the English and Spanish texts (legal text and notification copy especially) should be read by a native speaker, and counsel's review of the legal text now covers three languages.
- **Owner-only technical values** such as recurrence conflict `reason`/`status` codes are still shown raw. The WhatsApp message to customers (`buildWhatsAppRecurrenceConflictUrl`) is written in Portuguese, the customers' language.
- **Date formatting** relies on `Intl.DateTimeFormat`; Hermes on Android and native iOS can render month/weekday abbreviations slightly differently from Node. The formats are asserted in Jest and were checked in a browser, not on a device.
- Several internal `"… returned no row"` errors and shop-time `RangeError` details are not shown to users individually; they surface as the screen's translated fallback message.
