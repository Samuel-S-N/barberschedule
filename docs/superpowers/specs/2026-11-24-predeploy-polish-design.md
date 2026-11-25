# Pre-deploy polish batch — design

Date: 2026-11-24
Status: written for review; **not started**. The user's words (pt): "corrija cep, linguagem e bug do congelamento ... navegador deve
funcionar em base chromium, firefox, edge, safari ... verifique o jest".
Branch: `fix-predeploy-polish` (cut from `main` 0d8f304, PR #111 merged). Spec and plan ride along in the PR.

Wording: Zenc is for the whole beauty sector. Prose says "business" or "shop" (pt: estabelecimento / negócio).

Five items. Items 1, 2, 4 and 5 have a clear fix. **Item 3 (the theme bug) could not be reproduced here**; the evidence and what
is still needed are below, and the plan keeps its fix conditional on that (open question 1).

## 1. CEP lookup has no time limit

`src/features/shops/cep.ts` `lookupCep(cep, fetchFn = fetch)` calls ViaCEP and, only if that **throws or answers 5xx**, BrasilAPI.
A request that never answers neither throws nor answers, so the fallback is never tried and the owner waits with no message
(browsers keep a hung connection for minutes). The form itself is not blocked (`changeCep` does `void lookupCep(...).then(...)`),
but nothing happens: no address, no error.

Design:

- Every request gets its own limit, built on an `AbortController` and `setTimeout`, **cleared in `finally`** so a fast answer leaves
  no timer behind. The limit covers the headers **and** the body read (`response.json()` can hang too): the timer is cleared only
  after the body was parsed.
- **3 s for ViaCEP, then 3 s for BrasilAPI** (exported constant `CEP_TIMEOUT_MS = 3000`). Worst case the owner waits 6 s and then
  gets `unavailable` (the existing "could not look up the CEP" message). 3 s is above the normal ViaCEP answer (a few hundred ms) and
  below the point where people retype the CEP.
- A ViaCEP timeout is treated exactly like a network error: go to BrasilAPI. A BrasilAPI timeout gives `{ status: "unavailable" }`.
  A `not-found` answer still never triggers the fallback.
- `fetchFn` stays injectable. It is now called as `fetchFn(url, { signal })`. The existing assertion
  `toHaveBeenCalledWith(url)` in `tests/unit/cep.test.ts` becomes `(url, { signal: expect.any(AbortSignal) })`.
- No UI change (no spinner): out of scope.

Tests (TDD, fake timers): ViaCEP never answers (a `fetchFn` that only rejects when its `signal` aborts) → after 3 s BrasilAPI is called and
its address returned; both hang → `unavailable` after 6 s; a fast answer leaves no pending timer; a ViaCEP `erro:true` does not reach
BrasilAPI; existing cases unchanged.

## 2. `<html lang>` follows the active language

`app/+html.tsx:14` hard-codes `lang="pt-BR"`. The app speaks pt / en / es and the user chooses in Settings > Language
(`src/i18n/index.ts`: `setLanguagePreference` → `syncLanguage` → `i18n.changeLanguage`). Screen readers pick the voice, browsers offer
"translate this page" and hyphenation/quote rules from this attribute, so an English or Spanish user currently gets a page marked
Portuguese.

Design:

- Hook point: **`src/i18n/index.ts`**, the one place every language change goes through (initial `lng` from the device, the stored
  preference applied by `loadLanguagePreference` in `AppProviders`, the Settings choice, the app-foreground `syncLanguage`). A
  listener on i18next's own event covers all of them: `i18n.on("languageChanged", (lng) => applyHtmlLang(lng))`, plus one call right
  after `init`. This is *at load* (the module is imported before the first React render) and *on change*.
- Pure mapping `htmlLang(language)`: `pt` → `pt-BR` (the app's Portuguese is Brazilian; ViaCEP, CEP, BRL), `en` → `en`, `es` → `es`.
- `applyHtmlLang` writes `document.documentElement.lang` only when `typeof document !== "undefined"` (web, client). Native and the
  static export's Node render have no `document`: nothing happens there.
- `app/+html.tsx` keeps a static `lang="pt-BR"` as the **first-paint default** of the exported HTML (it cannot know the device
  language at export time); it is corrected as soon as the bundle runs. Open question 2 asks whether the default should differ.

Tests: unit test of `htmlLang` (3 languages + a fallback); with a stubbed `global.document`, `i18n.changeLanguage("es")` sets `lang="es"`
and `"pt"` sets `"pt-BR"`; `loadLanguagePreference` with a stored `en` sets `lang="en"`; no `document` → no throw. Playwright (web): the page
opens with `locale: "en-US"` and `document.documentElement.lang === "en"`; choosing Português in Settings > Language makes it `pt-BR`.

## 3. Theme: switches stay green after "Back to the Zenc default" ("the freeze")

Report: as owner, pick a green in Appearance and play with it; sign out, sign in as a customer to check the colours; back as
owner, press "Voltar ao padrão". Result: the switches (`Toggle`) stay green while the rest of the app is Zenc again.

Method: systematic-debugging; the web app on `seed-shop.localhost:8081` (Metro from this checkout), the real owner account, in the
browser pane, reading the live `<html>` variables and every switch track's inline `background-color`.

### What the code does (read first)

Two independent channels carry the theme:

1. **CSS variables on `<html>`** (`AppThemeProvider`, a `useEffect` that sets them and removes them in its cleanup), read by NativeWind
   classes (`bg-primary-400` …) everywhere. On native the same variables ride on a root `View` through `vars()`.
2. **React context** (`ThemeContext`), read by `useColors()`. `Toggle` (`src/components/ui/Toggle.tsx`) reads `colors.primary[400]`
   from it and hands the **JS hex** to `Switch`'s `trackColor`; the Bell/icon colours do the same.

`react-native-web`'s `Switch` is a pure function of its props (read: no memo, no cache), so on web a switch can only be wrong if the
**context** is stale, i.e. channel 2 disagrees with channel 1.

### Evidence (web, Chromium in the browser pane, this checkout)

| Flow | `--c-primary-400` | switch track | Result |
|---|---|---|---|
| save green `#2F9E5B`, reload, open Settings | `47 158 91` | `rgb(47, 158, 91)` | green, as expected |
| Appearance → "Back to default" → Settings (same session) | `219 154 52` | `rgb(219, 154, 52)` | **default, correct** (`<html style>` empty) |
| green (blue → green, accent green, save) → **sign out → sign in as owner** → "Back to default" → Account → Settings | `219 154 52` | `rgb(219, 154, 52)` | **default, correct** |
| reset, then sign out and in again, sampling `<html>` with a `MutationObserver` | stays `219 154 52` | — | no flash of the old green at all |

Jest evidence (native renderer): `AppThemeProvider` with `primary #2F9E5B` rerendered with no input → `Toggle`'s host `onTintColor`
goes `#2F9E5B` → `#DB9A34` (the default). A second scratch test refuted one suspect: `useShopTheme` falls back to `cache.value`, a React
state read **once per slug**, whenever the query has no data (e.g. after `queryClient.clear()` on a user switch,
`AppProviders.tsx:68`). It looked like a way for an old green to resurface; run through reset + `clear()` with the next answer pending,
the provider stayed on the default colours. (Both scratch tests were deleted; the plan re-adds the first as a regression test.)

**No freeze** was seen in any of these flows (the UI stayed responsive, navigation and the save/reset round-trip completed within ~2 s).
The "freeze" in the user's words most likely *is* this: part of the screen "frozen" in the old colour.

### Conclusion

**Not reproduced on web, and not reproducible in Jest.** The only account I could not use is the customer one (no credentials for
`samuel@teste.com`); I replaced it with an owner sign-out/sign-in, which exercises the same session change (`queryClient.clear()`),
but not a *customer's* view of the shop theme (customers read the shop through a different RLS path). The user's phone is the other
unknown: the report may come from Expo Go (native), where the switch is a **native** component (`UISwitch` / Android `SwitchCompat`)
that receives `trackColor` as a prop and where the CSS-variable channel is `vars()` on a root `View`. I cannot run a native build here,
so this is a hypothesis, not a finding: *a native switch that does not repaint its track when only `trackColor` changes while its
`value` stays the same*. It matches the symptom (only the switches, which are the one JS-coloured native control, stayed green).

Plan (conditional, see the plan's Task 5):

1. **First, a device repro by the user** (two minutes, steps in the plan): same flow in Expo Go, then in the browser. If the web flow
   also reproduces for the user, I need their exact steps (this changes the diagnosis).
2. If a native switch is the cause, fix it in the one place all switches go through: give `Toggle` a `key` derived from its track colour so
   it remounts when the theme changes (a switch is a leaf, remounting loses nothing; its state is its `value` prop). Jest test: a
   `Toggle` under `AppThemeProvider` has a different React key after the theme changes (so it cannot keep a stale native track).
3. Regardless of the cause, a regression test for the chain provider → context → `Toggle` (the first scratch test) is added now.

## 4. Installing and running on the common browsers

### What each browser can do (today's code in the right column)

| Browser | Can the page be installed? | How the user does it | What Zenc does today | Change |
|---|---|---|---|---|
| Chrome, Brave, Opera, Samsung Internet (desktop and Android), Chromium | yes | `beforeinstallprompt` → our button; else the browser menu | button via the captured event; **nothing** if the event never fires | none (see open question 3 about a menu hint) |
| Edge (Windows, macOS, Android) | yes | same as Chrome | same as Chrome | none |
| Vivaldi | Android yes; desktop: no reliable event | menu / event if fired | button if the event fires, else nothing | none (nothing rather than a dead button) |
| Firefox **Android** | yes | menu ⋮ → "Install" (older: "Add to Home screen"); **no** `beforeinstallprompt` | **nothing** (`unsupported`) | **new guide** `installable-firefox-android` |
| Firefox **desktop** | **no** PWA install | none | nothing | none (nothing is correct) |
| Safari **iOS / iPadOS**, and every iOS browser (Chrome `CriOS`, Firefox `FxiOS`, Edge `EdgiOS`) | yes | Share → "Add to Home Screen" | guide (already: Chrome gets its own ⋯ steps) | none |
| Safari **macOS 17+** (Sonoma) | yes | File (or Share) → "Add to Dock" | guide | none |
| Safari **macOS ≤ 16** | **no** | none | **shows the Add to Dock guide anyway** (dead instructions) | **fix:** only Safari 17+ (`Version/17` in the UA) |

The Safari 17 gate also closes the known follow-up "Mac 'Add to Dock' shown to all Safari".

Design:

- `install-state.ts`: new state `{ status: "installable-firefox-android" }`, detected by UA (`Android` and `Firefox/`, not
  `Seamonkey`), placed after the captured-prompt check and before `unsupported`. `isMacSafari` additionally requires Safari ≥ 17 read
  from `Version/(\d+)`; an unreadable version counts as **unsupported** (show nothing rather than a possibly dead guide).
- `InstallGuide`: a fourth variant `firefox-android` with two steps (open the ⋮ menu; tap "Install" or "Add to Home screen"). Copy in
  pt/en/es under `install.*` (`stepMenuFirefox`, `stepInstallFirefox`, `firefoxAndroidTitle`, `firefoxAndroidBody`); the existing locale
  parity test covers the three languages.
- `InstallPrompt` shows the same tappable card as iOS for the new state. Everything else (`unsupported`, `installed`, `native`) still
  renders nothing.

Tests: `install-state` table of user agents (Firefox Android, Firefox desktop, Safari 16/17 macOS, iPad as Mac, Chrome Android, Edge,
Samsung Internet, Vivaldi, Brave) → state; `InstallPrompt` renders the Firefox Android card and the guide; Playwright with
`userAgent` overrides on the profile page (Firefox Android card visible, Firefox desktop no card, Safari 16 no card) with screenshots at
390 px and computed-style checks of the card (same border, radius and padding as the iOS card).

### "The app must work on these engines" (smoke check)

Today the Playwright config has one implicit project (Chromium, the 275-spec suite, ~1 minute on the static export). Proposal:

1. Add `firefox` and `webkit` projects to `playwright.config.ts`, **selected by an environment variable**
   (`PLAYWRIGHT_ENGINES=all`, default chromium only), so a normal run is unchanged.
2. Run the whole suite once under each engine, list what fails, fix what is a real compatibility bug (CSS or API support), skip with a
   comment what is a Playwright-engine difference (for example web push and service worker specs, which differ per engine).
3. **Needs the engines downloaded** (`npx playwright install firefox webkit`, roughly 200 to 300 MB). This machine has no Playwright
   browsers installed (Chromium runs through the system Chrome); a Firefox 160 is installed system-wide but Playwright cannot drive a stock
   Firefox. **Open question 4** asks for permission to download them (and whether the projects stay permanently).
4. WebKit under Playwright is a Linux build of the WebKit engine: close to Safari but not Safari; real iOS Safari stays a manual
   check on the phone (open question 5 in the plan's checklist).

Already done here: a headless Firefox 160 screenshot of the login page against the dev server only captured the loading spinner (the
screenshot is taken before the dev bundle finishes), so it proves nothing; the smoke must run through Playwright.

## 5. Jest does not exit cleanly

Finding (run, not assumed). Full suite: **215 suites, 1324 tests, all pass**; after the summary Jest prints
"Jest did not exit one second after the test run has completed" and the process stays alive until killed.

- `--detectOpenHandles` does **not** name it: it ran for 75 s, printed no handle report and the process stayed alive (killed by me after
  5 minutes). A `globalTeardown` that dumps `process.getActiveResourcesInfo()` shows four pending `Timeout`s and no sockets or other handles.
- **Bisect:** every one of the 215 test files was run alone (`npx jest --runInBand <file>`, 60 s limit). **Exactly one** leaves the
  process alive: `tests/integration/app-providers.test.ts` (the other 214 exit by themselves).
- **Cause:** `AppProviders` creates its own `new QueryClient()` (default `gcTime` of 5 minutes). Every query it runs in the test
  schedules a 5-minute garbage-collection `Timeout`; after unmount the query stays in the cache, so the timer keeps Node alive. The
  other tests that render providers pass `gcTime: 0` (a known gotcha in the project notes); this one cannot, the client is internal.
- **Proof:** a scratch copy of the test that records every `QueryClient` that mounts (`QueryClient.prototype.mount`) and calls `.clear()` on
  each in `afterAll`: 12/12 tests pass **and the process exits (exit code 0, no warning)**.

Fix (test only, no production change): add that `afterAll` clear to `tests/integration/app-providers.test.ts`. The plan also adds a
one-line comment in the file saying why, and re-runs the full suite expecting no "did not exit" line and exit code 0.

## Testing and gates

TDD per task. Gates: `npm run typecheck`, ROOT `npm run lint`, full Jest (`Test Suites:` line and **no "did not exit" warning**), Playwright
(chromium full suite, plus the new specs; firefox/webkit once the engines are installed). pgTAP only if the database is touched: **none of
these items touches it**, so no migration is expected. Verify the UI in a browser for items 3 and 4 (screenshots at 390 px and
computed CSS).

## Open questions

1. **Theme bug (item 3).** Did it happen on the phone (Expo Go / dev build) or in a browser, and with which device? Can the user run
   the two-minute repro in the plan's Task 5 on the phone? Without a device repro the only fix I can justify is the defensive `Toggle`
   remount, which I cannot prove on a phone from here. Also: does the customer account of the report share the owner's shop (it must, for the
   colours to apply)?
2. **Static `lang` default.** The exported HTML says `pt-BR` until the bundle runs. Keep (recommended, the product is Brazilian) or
   export `en`?
3. **Chromium without `beforeinstallprompt`** (already installed, criteria not met, in-app browsers) shows nothing. Add a short "use the
   browser menu → Install" hint for Android Chromium, or keep nothing? (Recommended: keep nothing; a hint that may be wrong is worse.)
4. **Download Firefox and WebKit for Playwright** (about 200 to 300 MB) to run the engine smoke? And keep the `firefox` / `webkit`
   projects permanently (behind `PLAYWRIGHT_ENGINES`)? Recommended: yes to the download, keep the projects but not in CI yet.
5. **Real Safari and Firefox devices.** The engines under Playwright are close, not identical. Install on a real iPhone/Mac Safari and a
   Firefox Android stays a manual check for the user before deploy.
6. **Worst-case CEP wait is 6 s** (3 s + 3 s). Acceptable, or 2 s each?

## Out of scope

A loading indicator for the CEP lookup, a native (non-web) language-attribute equivalent, installing on Vivaldi desktop, deep-linking
the web push tap, any redesign of Appearance.
