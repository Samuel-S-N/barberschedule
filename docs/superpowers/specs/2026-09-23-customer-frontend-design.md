# Customer Frontend — Design

**Date:** 2026-09-23
**Status:** Draft (awaiting review)
**Branch:** `worktree-feat-customer-frontend`

## Goal

Ship the complete customer-side experience on the design system: account
creation, sign-in, tab navigation, home, booking, agenda with calendar
(reschedule/cancel), profile, and LGPD rights (consent, data export, account
deletion). Barber and owner screens are separate cycles.

## Scope

In scope: signup/login/reset redesign; customer tab navigation; Início,
Agendar, Agenda (with history), Perfil; reschedule via date/slot picker;
migration `0023` with the RPCs and consent table below; LGPD export and
account deletion; role-guard made extensible; e2e updates.

Out of scope: barber role (new spec: `barber` role enum, RLS, RPCs scoped to
`barbers.user_id`, owner invitation); owner-screen retrofit; social login;
dark mode; multi-shop.

## Findings that shaped this design

- No signup UI exists; `login.tsx` only signs in.
- A new account cannot book: booking review requires a `customers` row bound
  to the user, and no policy/RPC/trigger creates one (customers have only
  owner-insert and self-select policies). The architecture forbids
  auto-association by email/phone.
- Approved architecture: `profiles.role = owner | customer`; barbers are
  resources with nullable `user_id`; staff logins excluded from the MVP.
- Customer screens are unstyled; reschedule takes a raw ISO string.
- Design-system spec deferred the Bottom Tab Bar (§12.9) to a navigation spec;
  this is it.

## Backend — migration `0023_customer_self_service.sql` (additive)

All functions are `security definer`, fixed `search_path`, and derive the
actor from `auth.uid()`; no user id parameters. Execute revoked from `anon`.

- `ensure_my_customer(phone text default null)` — idempotent; returns the
  caller's active `customers` row for the single shop, creating it from
  profile name + auth email. Never matches existing rows by email/phone.
- `update_my_profile(full_name text, phone text)` — updates `profiles` and
  the caller's linked `customers` row in one transaction; validates
  non-empty name, phone format.
- `consents(user_id, kind, version, accepted_at)` — `kind in
  ('terms','privacy')`; RLS: user may insert/select own rows only; no
  update/delete. Signup records both with the current policy version.
- `export_my_data()` — returns one JSON document: profile, customer row,
  all appointments (including history/snapshots), consents, notification
  tokens (token values redacted to a suffix). Scoped strictly to `auth.uid()`.
- `prepare_account_deletion()` — invoked by the Edge Function below. Raises a
  stable error if the caller has an upcoming `scheduled|confirmed`
  appointment or an active recurrence series ("cancel first / contact the
  shop"). Otherwise: anonymizes the `customers` row (name → "Cliente
  removido", email/phone/user_id → null; the existing check constraint
  requires one of email/phone/user_id, so it is relaxed for anonymized rows
  via an explicit `anonymized_at` column), deletes notification tokens.
  Appointment rows and snapshots are kept for the shop's records.
- Edge Function `delete-account` (service role, authenticated caller only):
  calls `prepare_account_deletion()` as the user, then
  `auth.admin.deleteUser`. `profiles` cascades; consent rows are retained
  only as an anonymized audit trail (user_id set null) — legal basis:
  compliance with a legal obligation (LGPD art. 16 I).

## Routing and roles

```
app/
  (auth)/login, signup, forgot-password
  (customer)/_layout       # Tabs (Bottom Tab Bar)
    index                  # Início
    book/…                 # existing booking screens, shop picker skipped
    agenda                 # calendar + list + history segment
    reschedule             # date/slot picker for one appointment
    profile
    legal                  # terms + privacy text
```

- `(public)` is removed; `/book/*` moves under `(customer)`.
- `resolveAuthRedirect` uses a `ROLE_HOME: Record<AppRole, Group>` table so
  a future `barber` role is one entry, not a branching change.
- After first authenticated session for a customer, the app calls
  `ensure_my_customer` (React Query mutation, idempotent, gated on profile
  role).

New design-system component: `BottomTabBar` (DESIGN_SYSTEM §12.9), presentational,
with a11y roles/labels and 44×44 hit targets. Everything else reuses the
existing library.

## Screens

- **Signup:** name, email, optional phone (data minimization), password,
  required terms/privacy checkbox with links. Email-confirmation handled per
  Supabase config with a "check your email" state. Consent rows written on
  first authenticated session (also covers confirm-by-email flows).
- **Login / Forgot password:** redesigned; existing behaviors and e2e
  assertions preserved.
- **Início:** next appointment (`AppointmentCard`) or `EmptyState`, primary
  "Agendar" button.
- **Agendar:** existing barber → service → date → review flow; entry skips
  the shop picker.
- **Agenda:** `CalendarStrip` (days with appointments marked), the day's
  `AppointmentCard`s, segment "Próximos | Histórico". Actions per card:
  Reschedule (navigates to `reschedule`, reusing `CalendarStrip` +
  `TimeSlotPicker` + `get_available_slots`, then the reschedule RPC) and
  Cancel (confirmation). Both disabled with an explanatory note inside the
  90-minute cutoff (rule remains DB-authoritative; UI mirrors it).
- **Perfil:** edit name/phone, "Exportar meus dados" (JSON via `Share` on
  native, file download on web), terms/privacy links, sign out, "Excluir
  minha conta" with explicit confirmation and the blocking-error message.

## LGPD mapping

Consent at signup (art. 7 I, 8); minimization (phone optional); portability
and access (art. 18 II, V — export); erasure (art. 18 VI — anonymize + delete
auth user); transparency (in-app terms/privacy). Legal texts are placeholders
supplied by the shop owner — flagged as an open item, not invented here.
Retention: appointment history is kept anonymized for the shop's legitimate
interest and record keeping.

## Errors and states

Every screen has skeleton, empty and error states (`SkeletonLoader`,
`EmptyState`, `Toast`). Server errors map through `domain-errors.ts`; new
stable codes for deletion-blocked and profile validation are added there.

## Testing

Strict TDD, task by task.

- pgTAP: each RPC (happy path, anon denied, cross-user isolation,
  idempotency), consent RLS, deletion blocking and anonymization.
- Jest integration: API clients for the new RPCs; role-guard table.
- Jest unit: `BottomTabBar`, agenda day/segment logic, export file builder.
- Playwright (mocked Supabase REST, as today): signup, tab navigation,
  reschedule via picker, cancel, export, deletion-blocked. For every
  rewritten screen, existing e2e assertions are listed and preserved or
  intentionally updated.
- Gate: `npm run verify` + `npm run test:e2e:web` + `npm run export:web`,
  then code review before merge. Known unrelated failure: pgTAP
  `010_full_rls.sql` seed-count mismatch on clean `main`.

## Open items

- Terms/privacy text and version string (owner-provided).
- Whether Supabase email confirmation is enabled in each environment.
- Edge Function deployment needs the service-role secret (backend only).
