# Password recovery end to end + Security menu

## Problem
`requestPasswordReset` calls `resetPasswordForEmail(email)` with no `redirectTo`; there is no screen to set the new
password and `PASSWORD_RECOVERY` is not handled. The user clicks the e-mail link, lands logged in, and has nowhere to
change the password. Separately, Profile > Security shows the change-password form directly; the app pattern is
menus and dedicated screens (as Settings > Language).

## Decisions
- Platforms: web and native (Expo Go + builds).
- Approach A: a dedicated `/reset-password` route is the contract of the e-mail link; `PASSWORD_RECOVERY` is not used.
- After saving: global sign-out, then `/login` with a success notice.
- Security becomes a menu with one item, "Password"; the form moves to its own screen.

## Design

### 1. Route and guard
- `app/reset-password.tsx`, top level, outside any group. In `(auth)` the guard sends any session to home, and
  the recovery link creates a session. Without an exemption, a session-less visit goes to `/login` before
  `setSession` finishes.
- `resolveAuthRedirect` returns `null` when `segments[0] === "reset-password"` (like `legal`).

### 2. Sending the link
- `requestPasswordReset(supabase, email, redirectTo)`. The forgot-password screen passes
  `Linking.createURL("/reset-password")` (`exp://…/--/reset-password` in Expo Go, `barberschedule://reset-password`
  in builds, `origin/reset-password` on web).
- `supabase/config.toml` `additional_redirect_urls` gains `barberschedule://**`, `exp://**` and the local web origins.

### 3. Reset screen
- `src/features/auth/recovery.ts`: `parseRecoveryUrl(url)` returns `{ kind: "tokens", accessToken, refreshToken }`,
  `{ kind: "error" }` (fragment/query `error`/`error_description`) or `{ kind: "none" }`.
- Web: `detectSessionInUrl` consumes the fragment; the screen waits for the session.
- Native: `Linking.getInitialURL()` + `url` events, `parseRecoveryUrl`, then `supabase.auth.setSession`.
- States: checking (skeleton), form (new + confirm, `validateNewPassword`, no "current password"), invalid/expired
  (message + "request a new link" to `/forgot-password`).
- `setSession` fires `SIGNED_IN`; the provider's loading gate remounts the navigator. A module-level record of the
  last consumed `refresh_token` keeps the remounted screen from consuming it twice.
- On submit: `updateUser({ password })`, `signOut({ scope: "global" })`, `router.replace` to `/login` with a route
  param that the login screen shows in a `Toast`.

### 4. Security menu
- `me/security.tsx` becomes a `MenuBlock` with one item, "Password" (`KeyRound`), pushing `/me/security/password`.
- Current form moves unchanged (same testIDs `security-*`) to `me/security/password.tsx`; customer `_layout` registers
  `me/security/password`.
- i18n keys in pt/es/en.
- Owner and barber have no Security screen today; out of scope.

### 5. Tests
- Unit: `parseRecoveryUrl`; guard exemption; `requestPasswordReset` passes `redirectTo`; locale parity.
- Integration (local Supabase): reset e-mail via Inbucket, `setSession`, `updateUser`, old password rejected.
- E2E web: recovery URL → new password → login with notice; invalid link shows error; Security menu → Password.
  Visual check in the browser (screenshot + computed CSS).
