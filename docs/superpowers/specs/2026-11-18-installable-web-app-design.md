# Installable web app (multi-shop, part 3) — design

Date: 2026-11-18
Status: draft, waiting for the user's review
Depends on: part 1 (subdomains). Part 4 (web push) reuses its service worker.

## Why

Zenc launches on the web first, with no store apps, to cut costs. People still want an icon on the phone's home
screen. The user's other project, fitbrother, already solves this with an "install" button on the profile screen;
this part brings the same pattern to Zenc (read from `~/projects/fitbrother/apps/mobile`, never edited there).
On iPhone it also matters for part 4: web push only works for a web app added to the home screen (iOS 16.4+).

## Decisions

- The installed app is always named **Zenc** with the Zenc icon, on every shop subdomain (user decision 2026-11-18).
  One static manifest, no per-shop server.
- Browsers install per address, so a customer who uses two businesses gets two "Zenc" icons. Accepted.

## Scope

### 1. Web shell

- `app/+html.tsx` (Expo Router's custom HTML for the static export) adds: `<link rel="manifest">`, Apple tags
  (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` `black-translucent`, title "Zenc",
  `apple-touch-icon`), `theme-color`, and a small inline script that captures `beforeinstallprompt` as early as
  possible into `window.__zencInstallPromptEvent` (Chrome can fire it before the bundle mounts and fires it once).
- `public/manifest.json`: `name`/`short_name` "Zenc", `start_url` "/", `scope` "/", `display` "standalone",
  `orientation` "portrait", `lang` "pt-BR", `background_color` and `theme_color` `#171412` (ink, decision 017), icons
  192 and 512 (`any`) and 192 and 512 (`maskable`).
- `public/icons/`: those four PNGs plus `apple-touch-icon.png` (180), generated once from the existing `assets/icon.png`
  and committed. The maskable ones keep the wordmark inside the safe zone on the ink background.
- `public/sw.js`: a minimal service worker (no offline cache in this part), registered on web at app start. Part 4 adds
  its push handlers.

### 2. `useInstallPrompt` and `InstallPrompt`

Ported from fitbrother's `useInstallPrompt.ts` and `InstallPrompt.tsx`, restyled with Zenc's components and theme
tokens, texts in pt/es/en. States:

| State | What the user sees |
|---|---|
| Native app or already installed (standalone) | Nothing |
| Chrome / Android / Edge with a captured prompt | Card "Install the app" with an **Install** button that opens the browser's own prompt |
| Any browser on iPhone/iPad | Card "Add to Home Screen" that opens a 2-step guide (Chrome iOS: menu ⋯ → Add to Home Screen; others: Share, or the browser menu first → Add to Home Screen) |
| Safari on Mac | Card "Add to Dock" with a 2-step guide |
| Anything else | Nothing |

The guide is a centred floating window with an X and close-on-tap-outside (project pop-up style).

### 3. Where it shows

On the profile/settings hub of every role: customer `app/(customer)/(tabs)/profile.tsx`, professional
`app/(professional)/my-profile/index.tsx`, owner `app/(owner)/owner-profile`.

## Out of scope

Offline caching, per-shop names or icons, an install prompt shown automatically (only the profile card).

## Testing

- Jest: `useInstallPrompt` state for each case (mocked `navigator`, `matchMedia`, the captured event, `appinstalled`);
  `InstallPrompt` renders the right card per state and calls `prompt()` on Install; the guide opens and closes.
- Unit test that `public/manifest.json` points at icon files that exist with the declared sizes.
- Browser check (Playwright/Chrome): the manifest and service worker load from the static export; the card shows on
  the three profile screens. Real install checked by the user on an Android phone and an iPhone once hosted.
