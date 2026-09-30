# Customer profile tab — design

Scope: customer role only. Owner and barber profiles reuse the new components later.

## Screen structure

`app/(customer)/(tabs)/profile.tsx` becomes a hub, styled after the reference (block separation), using the app's
light tokens (`DESIGN_SYSTEM.md`), not the reference's dark theme.

- Header: round 96px `Avatar` (photo or initial) with a camera badge, name, e-mail.
- Block 1: Meus dados, Segurança. Block 2: Configurações, Privacidade e dados, Sobre. Then a red Sair button.
- New components in `src/components/domain/`: `Avatar`, `MenuBlock` (a card of `MenuRow`s: icon, title, chevron, dividers).

Inner screens are new routes in the `app/(customer)` Stack, each with a back button:

| Route | Content |
|---|---|
| `account` | change photo, name, phone; e-mail with "change e-mail" (`auth.updateUser({ email })`, confirmation link) |
| `security` | change password: current password (re-auth via `signInWithPassword`), new + confirm, `updateUser({ password })` |
| `settings` | Baixar meus dados (moved from the old screen). No language selector: language follows the device (ADR 012) |
| `privacy` | terms (`/legal`), Excluir conta (existing two-step confirmation) |
| `about` | app name and version from `app.json` |

## Data

One migration:
- `profiles.avatar_url text`.
- Public bucket `avatars`; storage policies let a user insert/update/delete only under `<uid>/`.
- RPC `set_my_avatar(p_url text)`: caller's own profile only; url must be null or point into the caller's folder of the bucket.
- Trigger `after update of email on auth.users`: copies the new e-mail to `customers.email` where `user_id = new.id`
  (fires only after the user confirms the change link; also covers changes made outside the app).

Client: `expo-image-picker` (square crop, compression). Validate type (jpeg/png/webp) and size (≤ 2 MB), upload to
`<uid>/avatar-<timestamp>.jpg`, then call `set_my_avatar`.

Account deletion: the `delete-account` edge function also removes `<uid>/` from the bucket. `export_my_data` includes `avatar_url`.

## Errors and copy

Reuse `Toast` and `errorMessage`. All strings via i18n (pt, en, es).

## Testing

- Unit: avatar initial, image validation.
- Integration (pattern of `tests/integration/account.test.ts`): storage policies (owner-only writes), `set_my_avatar` rules,
  e-mail trigger, export includes `avatar_url`.
- E2E web (Playwright): hub blocks and navigation to each inner screen.
- Browser check with screenshot and computed CSS (per the project's UI-verification rule).

## Out of scope

Notifications, help/contact, public profile, sessions/devices, language selector.
Known ceiling: bucket is public-read with UUID paths (not listable), which is enough for profile photos.
