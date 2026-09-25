# Device Language (i18n) — Design

**Date:** 2026-09-25
**Status:** Draft (awaiting review)
**Branch:** `feat-i18n` (stacked on `worktree-feat-customer-frontend` / PR #1, which holds the customer screens this translates)

## Goal

The whole app follows the device language: Portuguese (Brazil), English and Spanish, including owner screens, error messages, legal text and push notifications. No in-app language picker.

## Decisions (from brainstorming)

- Languages: `pt` (Brazilian Portuguese, the reference language), `en`, `es`. Any other device language falls back to `en`.
- Scope: every screen (customer, auth, legal, owner), shared components, error messages, and push notifications.
- Times are always 24h (`09:00`); only dates (weekday, month) follow the language.
- Library: `i18next` + `react-i18next` + `expo-localization`.
- Follows the device only; no override setting.

## Findings that shaped this design

- No i18n dependency or `expo-localization` exists today.
- Visible English text lives in about 25 route/component files (77+ distinct strings in the customer app, plus the 10 owner screens).
- Three date formatters hardcode a locale: `src/lib/dates/calendar-strip-days.ts` (`en-US`), `src/lib/dates/shop-time.ts` (`en-US`, used only for parsing shop-local parts), `src/features/appointments/agenda-view.ts` (`en-GB`).
- `formatPriceBRL` already prints `R$ 65,00`; the currency belongs to the shop, not the user.
- Appointment times follow the **shop** timezone (`America/Sao_Paulo`), not the device (docs/decisions/002-timezone-model.md). Language and timezone are independent; the timezone does not change.
- `supabase/functions/dispatch-notifications/index.ts` sends `title: notification.event_type, body: notification.event_type`, i.e. raw codes such as `appointment.reminder`. No human-readable notification text exists in any language. Event types: `appointment.booked`, `appointment.cancelled`, `appointment.rescheduled`, `appointment.reminder`, `recurrence.conflict`.
- `register_notification_token(target_expo_push_token, target_platform)` stores no language.
- Auth errors from Supabase reach the UI as English `error.message`; `DomainError` carries a stable `code` plus an English message.

## Architecture

### Language resolution

`src/i18n/language.ts` exports `resolveLanguage(languageCode: string | null | undefined): "pt" | "en" | "es"` (`pt*` → `pt`, `es*` → `es`, everything else → `en`). `src/i18n/index.ts` initialises i18next with `resources = { en, pt, es }`, `fallbackLng: "en"`, `interpolation.escapeValue = false`, and the language from `getLocales()[0]?.languageCode` (expo-localization). The app re-resolves the language when `AppState` returns to `active`, so changing the device language while the app is backgrounded updates it without a restart. `AppProviders` wraps the tree in `I18nextProvider`.

### Where text lives

`src/i18n/locales/{en,pt,es}.ts`, one nested object per language, grouped by area: `common`, `tabs`, `auth`, `home`, `appointments`, `book`, `profile`, `legal`, `owner`, `status`, `errors`. Interpolation uses `{{name}}`. Keys are typed from the `en` resource so a missing key is a compile error in the calling code. Components that own default text (`StatusBadge`, the `AppointmentCard` fallbacks, the tab labels) call `useTranslation`; components that already take text through props stay presentational.

### Dates, times, prices

- `src/lib/i18n/format.ts` provides `formatWeekdayShort(isoDate, lang)` and `formatDateLabel(isoDate, lang)` using `Intl.DateTimeFormat` with the resolved language. Callers in `calendar-strip-days.ts` and `agenda-view.ts` use them; `shop-time.ts` keeps its fixed locale because it only extracts numeric parts in the shop timezone.
- Times stay `HH:mm` from the database (24h in every language).
- Prices stay `formatPriceBRL`.
- Shop, barber and service names and appointment notes are content and are not translated.

### Errors

- `DomainError.code` maps to `errors.<CODE>` in every language. The English `message` remains only as a last-resort fallback. A helper `errorMessage(error, t)` in `src/i18n/errors.ts` returns the translated text; screens use it instead of `error.message`.
- Supabase auth errors are mapped by `error.code` (`invalid_credentials`, `user_already_exists`, `weak_password`, `email_not_confirmed`, `over_request_rate_limit`, `over_email_send_rate_limit`) to `errors.auth.<code>`; anything else shows `errors.generic`.

### Legal text

`LEGAL_SECTIONS` moves into the `legal` resource of each language. Portuguese is the reference text; English and Spanish are convenience translations, and the legal screen says so. `TERMS_VERSION` is unchanged because the terms are the same. Counsel review must now cover the three texts.

### Push notifications (backend)

- Migration `0024_notification_locale.sql`: `notification_tokens.locale text not null default 'en' check (locale in ('en','pt','es'))`; `register_notification_token` gains `target_locale text default null` (null or unsupported → `en`, updated on every registration); `claim_notification_batch` also returns `locale`.
- Client: `registerNotificationToken` sends the resolved language.
- `supabase/functions/dispatch-notifications/messages.ts` is a pure TypeScript module (no Deno globals) exporting `buildMessage(eventType, locale, payload, timezone?)` → `{ title, body }` for the 5 event types × 3 languages, formatting `starts_at` in the shop timezone with the chosen language. `index.ts` calls it instead of sending the event code. Unknown event type or unknown locale falls back to `en` / a generic body. Tokens created before this change have locale `en`.
- The module is importable from Jest, so the message text is unit-tested without a Deno runner. The function's HTTP path is verified manually as before (see docs/decisions/011).

## Testing

- Jest: `resolveLanguage`; key parity across `en`/`pt`/`es` (same keys, same `{{placeholders}}`, no empty strings); `format.ts` in the three languages; `errorMessage` for every `DomainError` code and each mapped auth code; `buildMessage` for every event × language and the fallbacks.
- A guard test scans `app/` and `src/components/` for JSX string literals and `label=`/`placeholder=`/`title=` literals that bypass `t()` (allowlist for test ids and non-text props).
- pgTAP: `register_notification_token` stores and updates the locale, rejects nothing for unknown locales (normalises to `en`), `claim_notification_batch` returns it.
- Playwright: the existing specs run with the browser locale fixed to `en-US` (configured once); new specs cover `pt-BR` and `es-ES` for login, the agenda, and an error message, and check the weekday labels change with the language.
- Full gate: `npm run verify`, `npm run test:e2e:web`, `npm run export:web`, then code review. UI is checked in a browser per language.

## Out of scope

In-app language picker; languages beyond `pt`, `en`, `es`; localising shop-provided content; right-to-left languages.

## Risks and open items

- Translation quality: pt is written as the reference, es and en are derived. A native reviewer should read the es and en texts, especially legal and notification copy.
- `Intl.DateTimeFormat` locale support differs slightly between Hermes (Android) and iOS; formatted labels are asserted in Jest (Node) and checked visually on device.
- Existing notification behaviour changes from raw event codes to real text; this is a visible improvement but should be checked on a device with a real push token.
- Existing e2e assertions rely on English text; they are kept by fixing the browser locale rather than rewritten.
