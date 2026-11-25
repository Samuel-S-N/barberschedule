# Profile consistency and the WebKit run — design

Date: 2026-11-25
Status: written for review; **not started**. Rides in PR #112 (branch `fix-predeploy-polish`).
The user's words (pt) for item 4 are in its section. For items 1 to 3: "o botão de sair do perfil do owner está no perfil, e não dentro de configs, todos os perfis devem seguir o mesmo
padrão, verifique o do profissional também" and "faça a investigação, padronize a ordem e o botão de sair".

Wording: Zenc is for the whole beauty sector. Prose says "business" or "shop" (pt: estabelecimento / negócio).

Four parts: (1) sign out lives in Settings for every role, (2) the three profile hubs share one order and one set of icons, (3) the
WebKit e2e run: why 222 of 280 specs failed, and what to do about it, (4) an owner who starts serving as a professional gets the
shop's hours copied once, and is guided when hours or services are missing.

## 1. Sign out lives in Settings, for every role

Today (read from the code):

| Role | Where "Sign out" is | How |
|---|---|---|
| Customer | **Settings** (`/me/settings`) | `ProfileSettingsScreen` with `showSignOut` → `SignOutButton` (`src/features/account/SignOutButton.tsx`), copy `profile.signOut` |
| Owner | **the profile hub** (`app/(owner)/settings.tsx`, last element) | its own inline `Pressable`, copy `common.signOut` |
| Professional | **the profile hub** (`app/(professional)/my-profile/index.tsx`, last element) | its own inline `Pressable`, copy `profile.signOut` |

Design (approved by the user):

- `ProfileSettingsScreen` **always** renders `SignOutButton`; the `showSignOut` prop is removed, and `app/(customer)/me/settings.tsx`
  stops passing it. The three Settings routes (`/me/settings`, `/owner-profile/settings`, `/my-profile/settings`) are the same component, so
  all three get the button.
- The owner and professional hubs lose the inline button and what only it used:
  - owner hub: imports `Pressable`, `LogOut`, `signOut`. It **keeps** `useState`/`error`/`Toast`/`errorMessage` (the "also a
    professional" toggle reports its errors through the same `Toast`) and `useColors` (the toggle row's icon).
  - professional hub: imports `Pressable`, `LogOut`, `signOut`, `Toast`, `errorMessage`, `useState`/`error`, `useColors`/`colors`: all
    used only by the sign-out button. (ESLint's unused-import rule is the check; the plan removes exactly what it flags.)
- **One copy key.** `common.signOut` and `profile.signOut` are the same text in every language today (pt "Sair", en "Sign out", es
  "Cerrar sesión"), so nothing changes on screen. The shared `SignOutButton` uses `profile.signOut`. `common.signOut` stays (it is used by
  `ShopGate` and `app/index.tsx`, outside the profile).
- Tests that sign out through a hub are updated to go through Settings (list in the plan): owner-profile and owner-shell specs expect the
  button on the hub today; the `showSignOut` unit tests change shape.

## 2. The same menu order and icons on every hub

Reference: the **customer** hub (the user's earlier decision: the install card comes first, then the avatar, then the blocks).

### Before / after, per role (top to bottom)

| # | Customer, before | Customer, after |
|---|---|---|
| 1 | Install card | Install card |
| 2 | Avatar, name, e-mail | Avatar, name, e-mail |
| 3 | Account, Security | Account, Security |
| 4 | Recurring plans | Recurring plans (role-specific) |
| 5 | Settings (`Settings`), Privacy (`UserCog`), About (`Info`) | Settings (`Settings`), Privacy (**`Lock`**), About (`Info`) |
| 6 | (Sign out is inside Settings) | (inside Settings) |

| # | Owner, before | Owner, after |
|---|---|---|
| 1 | Avatar, name, e-mail, role label | **Install card** |
| 2 | Account, Security | Avatar, name, e-mail, role label |
| 3 | "Also a professional" switch card, then "My professional" row when on | Account, Security |
| 4 | **Privacy (`Lock`), Settings, About** | "Also a professional" switch card, then "My professional" row when on (role-specific) |
| 5 | Install card | **Settings, Privacy (`Lock`), About** |
| 6 | **Sign out button** | (removed: inside Settings) |

| # | Professional, before | Professional, after |
|---|---|---|
| 1 | Avatar, name, e-mail, role label | **Install card** |
| 2 | Account, Security | Avatar, name, e-mail, role label |
| 3 | Services, Availability, Recurrence, Compensation | Account, Security |
| 4 | Settings, Privacy (`Lock`), About | Services, Availability, Recurrence, Compensation (role-specific) |
| 5 | Install card | Settings, Privacy (`Lock`), About |
| 6 | **Sign out button** | (removed: inside Settings) |

Settings screen, all roles (after): Language row, Notifications row, **Sign out** button (today the owner and professional Settings have only
the first two).

Decisions to confirm (also listed under Open questions):

- **Privacy icon: `Lock`.** The customer uses `UserCog`, the other two use `Lock`. `UserCog` reads as "account settings" (next to `User` for
  Account and `Settings` for Settings) while Security already owns `ShieldCheck`; `Lock` is on two of the three hubs and says "privacy". One
  line changes (customer).
- **Install card at the top on every hub.** Only the customer has it there; owner and professional have it near the bottom. Consistent with
  the reference and the earlier customer decision (it is the only thing a visitor on a browser can act on). It does push the owner's and
  professional's avatar down by the card's height (56 px, and only when the browser can install the app: no card, no shift).
- **Role-specific blocks keep their place:** between Account/Security and Settings/Privacy/About, as the professional hub does today.

Avatar `accessibilityLabel` strings differ per role (`profile.menu.account` vs `professional.hub.menu.account`): same visible text, left alone.

## 3. WebKit: why 222 of 280 specs failed

Method: systematic-debugging; the static export (`.e2e-dist`, rebuilt from this branch) served by `scripts/serve-web-static.mjs` on 4173;
Playwright 1.62.1 with WebKit 26.5 (`ubuntu24.04` fallback build); single probes with `page.evaluate`, then the real specs.

### The orchestrator's run was mis-configured, not broken

It ran with `PLAYWRIGHT_TEST_BASE_URL=http://localhost:4173` and with `.env.local` in place.

1. **The bare host has no shop.** The shop slug is the first label of the host (`getE2EWebBaseUrl()` is `http://shop-a.localhost:4173`).
   On `localhost` the app correctly shows the bare-domain gate ("Open the link your business sent you"), which is exactly what `smoke.spec`
   showed. Not a WebKit problem.
2. **`.env.local` holds the LAN Supabase URL** (`http://192.168.x.x:55421`). Expo inlines it into the export, so the client's session key
   becomes `sb-192-auth-token` while the specs seed `sb-example-` / `sb-127-`: every authenticated spec redirects to sign-in. This is the known
   gotcha (project notes), engine-independent.

Rerun with the **default base URL and `.env.local` moved aside**, same build, same machine:

| Engine | Result |
|---|---|
| Chromium (system Chrome) | 280 / 280 |
| Firefox 153 | 280 / 280 |
| **WebKit 26.5** | **271 passed, 9 failed** (3.2 min) |

### The 9 failures: all push / service-worker, three causes inside Playwright's WebKit, none in our code

The 9 are every spec of `notifications-prompt.web.spec.ts` (4) and `web-push.web.spec.ts` (5). Everything else (auth, sessions, shop
resolution, cookies, booking, owner, professional, install, themes, language) passes on WebKit.

| # | Cause | Evidence |
|---|---|---|
| 1 | `context.grantPermissions(["notifications"])` is **a silent no-op** on WebKit | probe: after the grant, `Notification.permission` is `"default"` on WebKit and `"granted"` on Firefox; no error |
| 2 | The real **`PushManager.getSubscription()` never settles and wedges the page** (Linux WebKit has no push service) | probe: `serviceWorker.register`/`getRegistration`/`ready` resolve, `getSubscription()` hangs; in the owner Settings spec `locator.count()` itself times out (page unresponsive) until `getSubscription` is stubbed, then the page and the switch work. A product-side 3 s timeout around it did **not** help (the page thread is blocked), so I reverted that experiment |
| 3 | After the service worker takes control, **requests bypass `page.route`** | professional Settings spec: `get_my_professional_profile` never reaches the route handler (logged with a catch-all `page.route`; the browser then fails to resolve `example.supabase.co`) while the earlier `get_current_profile` does; the same spec **passes with `serviceWorkers: "block"`** |

Cookies, the original suspicion: **not involved.** The e2e export sets no `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN`, so the session cookies carry no `Domain`
attribute, and WebKit stores them (probe: no-Domain cookie accepted on `shop-a.localhost` by WebKit, Firefox and Chrome). One real difference found:
on a shop host (`shop-a.localhost`) all three engines reject `Domain=.localhost` and `Domain=localhost`; on the bare `localhost` Firefox and Chrome accept them and WebKit
does not. So setting `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN=.localhost` for local development would not share a session across shops on any engine. Production uses
`.zencpro.app` over https, a normal registrable domain; nothing to fix.

### Classification: (a), a test-environment artifact

Not a real Safari bug in our code, as far as an engine on Linux can show: real Safari on macOS and iOS has a push backend (`getSubscription()`
resolves), supports the notifications permission through a real prompt, and its service worker is not a Playwright route problem. The honest
limit: Playwright's WebKit is a Linux port of the engine, close to Safari but not Safari; **push, install and the cookie session on a real
iPhone and Mac Safari stay a manual check** before deploy (open question 3).

### The cheapest way to make the WebKit run meaningful

1. Run it correctly: default base URL (no `PLAYWRIGHT_TEST_BASE_URL`), `.env.local` moved aside, static export:
   `PLAYWRIGHT_ENGINES=all npx playwright test --project=webkit`. The command and its two traps are written into `playwright.config.ts`.
2. **Skip only the two push spec files on WebKit**, with a comment naming the three causes:
   `test.skip(({ browserName }) => browserName === "webkit", "...")` at the top of `notifications-prompt.web.spec.ts` and
   `web-push.web.spec.ts`. Result: **271 passed, 9 skipped, 0 failed** on WebKit, and every other spec (including the owner and professional
   Settings screens this work changes) is a real check on that engine.
3. Rejected: stubbing `getSubscription` for WebKit in the shared fixture (it fixes 2 of the 9 and hides causes 1 and 3 behind a half-working
   emulation), and a product-code timeout (does not work, see cause 2).

## 4. The owner as a professional: shop hours copied once, and a guide when something is missing

The user's words (pt): "habilite por padrão que o owner segue os horários do estabelecimento por padrão, quando não disponível orientar a
registrar os horarios"; then "copia única, apenas a primeira segue essa regra" (they chose a **one-time copy**). The separate idea of dimming
professionals without hours in the Book tab is **parked by the user** and not part of this work.

### The problem (found on the local database)

The owner turned on "Atender como profissional" (`app/(owner)/settings.tsx`, `useOwnerAsProfessional`). That created the owner's professional
with its services but **no `working_periods`**: booking has no slots, every day is dimmed, and nothing tells the owner. The shop's hours
(`shop_hours`, edited in `app/(owner)/shop.tsx`) are informational only: they never open the agenda.

### Design

1. **Copy once, when the toggle goes on.** When "Atender como profissional" is turned **on** and the owner's professional has **no
   working periods at all**, the shop's hours are copied into the owner's `working_periods`.
   - "Apenas a primeira": the copy happens only when there are **zero** periods. Turning the switch off and on again, a later change to the
     shop hours, or a professional who already has hours never copies or overwrites anything. This covers both a new professional (just created)
     and an existing one being re-enabled (for example one created earlier with no hours).
   - Known edge, accepted: an owner who deliberately deletes **every** period and then turns the switch off and on gets the shop hours again,
     because "no periods" is the rule. Tracking "already copied once" would need a new column for a corner nobody asked about.
2. **One copy function, not two.** The existing "Copy the shop hours" button of `app/(owner)/schedule.tsx` (`copyShopHours`, which reads
   `listShopHours` and calls `createWorkingPeriod` per period) is lifted into `src/features/schedule/copy-shop-hours.ts`
   (`copyShopHoursToProfessional(supabase, shopId, professionalId): Promise<number>`, the count copied). The schedule button and the toggle
   both call it. `useOwnerAsProfessional` adds only the "no periods yet?" check around it.
3. **Client-side, no RPC (decided).** Reasons: the logic already exists on the client and the user asked to reuse it, so an RPC would be a
   **second copy** of it (in SQL) plus a migration (`0080`) and pgTAP; the owner can already write their own `working_periods` and read `shop_hours`
   under RLS, so no privilege is missing; the only thing an RPC would add is atomicity, and the cost of its absence is small and visible:
   at most seven inserts, run one after another; if one fails midway the owner gets the error toast, sees the periods that were written in
   *Manage schedule*, and completes the rest by hand (the same weakness the existing manual button already has). The toggle is disabled while
   the mutation runs, so there is no double tap. If this ever needs to be atomic, it is a drop-in swap of the one shared function for an RPC.
   **No migration, no pgTAP.**
4. **A guide when the owner's professional cannot be booked.** On the owner hub, under the "Serve as a professional" card, while the
   switch is on, a guide row is shown for each thing missing:
   - **no working periods** (the shop has no hours either, so nothing could be copied, or the copy failed, or the professional existed
     before this change): "Cadastre seus horários para aparecer no agendamento" with a button that opens *Manage schedule* with the owner's
     professional preselected;
   - **no active services**: "Escolha os serviços que você atende para aparecer no agendamento" with a button that opens the owner's
     professional profile (where the services are edited: the existing "My services and hours" row's target).
   Both missing: both rows. Neither missing: no guide. The switch off: no guide.
5. **Copy (pt / en / es), under `owner.profile`:**

   | key | pt | en | es |
   |---|---|---|---|
   | `guideHours` | Cadastre seus horários para aparecer no agendamento. | Add your working hours to appear in booking. | Registra tus horarios para aparecer en la reserva. |
   | `guideHoursAction` | Cadastrar horários | Add hours | Registrar horarios |
   | `guideServices` | Escolha os serviços que você atende para aparecer no agendamento. | Choose the services you offer to appear in booking. | Elige los servicios que atiendes para aparecer en la reserva. |
   | `guideServicesAction` | Escolher serviços | Choose services | Elegir servicios |
   | `shopHoursCopied` (toast, success) | Copiamos o horário do estabelecimento para você. | We copied the shop hours for you. | Copiamos el horario del establecimiento para ti. |

6. **Schedule screen takes a professional.** `app/(owner)/schedule.tsx` has no route parameters today and preselects the first professional.
   It gains `professional` (`/schedule?professional=<id>`): used as the initial selection when it names a professional of the shop, otherwise
   the current behaviour (first professional).
7. **Freshness of the guide.** The hub reads two small queries, keyed so the existing invalidations reach them without new plumbing:
   hours under `["owner-schedule", "setup", shopId]` (the schedule screen invalidates the prefix `["owner-schedule"]` after every change) and
   services under `["owner-professional-services", "setup", shopId]` (the services editor invalidates that prefix). The toggle's mutation
   invalidates both and `["owner-professionals"]` in `onSettled`, so the guide updates even after a failed copy.

### Tests (TDD)

- Unit, the shared function: copies each shop period for the professional; copies nothing and returns 0 when the shop has no hours; stops at
  the first failed insert and rethrows.
- Unit, the hook (`useOwnerAsProfessional`, mocked api): toggle on for a new professional with no periods and shop hours → created, then every
  period copied; toggle on for an existing inactive professional with no periods → re-enabled and copied; toggle on with existing periods →
  re-enabled and **no** period created; toggle off → no copy; toggle on again after periods exist → no copy; shop with no hours → professional
  created and nothing copied.
- Unit, the guide: shown with no periods, shown with no services, both rows, hidden when both exist or the switch is off; the hours action
  navigates to `/schedule?professional=<id>`, the services action to the professional profile.
- Schedule: `/schedule?professional=<id>` preselects that professional; an unknown id falls back to the first.
- Playwright (owner hub, chromium): toggle on with shop hours → the professional's periods are inserted (request bodies), a success toast, no
  guide about hours; toggle on with no shop hours → no inserts, the hours guide visible, its button lands on the schedule with the owner's
  professional selected; a professional with periods and no services → only the services guide. Screenshots at 390 px and a browser check on
  the local database (the owner's professional "Pereira", today with no periods, is the live case).


## Testing

TDD per task. Unit: `profile-settings-screen` (button always shown, sign out and error path still work). Playwright (chromium, with
screenshots at 390 px and computed CSS of the sign-out button): on each role's hub there is **no** sign-out button, the order is install card,
avatar, Account/Security, (role blocks), Settings, Privacy, About; on each role's Settings screen there **is** one and pressing it ends on
`/login`. The existing owner and professional specs that expect the button on the hub change accordingly.
Item 4's tests are in its section. Gates: `npm run typecheck`, ROOT `npm run lint`, full Jest (no "did not exit" line), Playwright chromium whole
suite, then Firefox and WebKit whole suite (expected 280/280 plus the new specs, and WebKit with the 9 push specs skipped). No database change.

## Open questions

0. **Item 4, the "delete every period then toggle" edge** re-copies the shop hours (rule: no periods at all). Accept (recommended) or track a
   "copied once" flag with a column and a migration?

1. **Privacy icon** `Lock` for all (recommended) or keep `UserCog` on the customer hub and change the other two?
2. **Install card at the top on all three hubs** (recommended; it moves owner and professional) or leave it at the bottom for them and put
   the customer's there too?
3. **Real devices.** Push, install and sign-in on a real iPhone and Mac Safari cannot be covered by Playwright's WebKit; a short manual
   checklist for the user is in the plan. Anything beyond that (a hosted device lab) is out of scope.
4. **Skipping the push specs on WebKit** permanently, or revisit when a Playwright release gives WebKit a notifications permission?
   (Recommended: skip with the comment; revisit then.)

## Out of scope

Dimming professionals without hours in the Book tab (parked by the user), a database function or migration for the copy, copying the lunch break,
changing what the hubs list for each role beyond order and icons, the role-specific blocks, the account/security screens, deep-linking the
web push tap, and any change to push behaviour.
