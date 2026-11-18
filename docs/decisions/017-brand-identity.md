# Decision 017: Zenc brand identity (wordmark, icons, colours)

Date: 2026-11-17
Status: accepted

## Context

The brand is Zenc (decision 015). The logo was explored on 2026-11-17. The first reference image (a ribbon-shaped Z
with a check mark) looked AI-generated, so everything was redrawn as original vector work. Directions sketched: a
ribbon Z with a check, a Z built from calendar cells, one continuous Z stroke ending in the dot, a calendar tile with a
Z inside (built in full, then archived) and the wordmark alone. The user chose the wordmark alone as the default
identity "for now".

## Decision

- **Logo:** the wordmark `ZENC.` only: Oswald Bold (the product's display font) with the period drawn as a circle in
  wine. An optional tagline, "Sua vez. Seu estilo.", in Oswald Light.
- **App icon is the name too:** `ZENC.` on one line, cream on ink `#171412`, with the dot in light wine. Below about
  64 px the name does not read, so the favicon and the notification silhouette use only `Z.`.
- **Logo colours:** ink `#171412`, cream `#F7F3EE`, wine `#7A1F2B` for the dot on light backgrounds and **light wine
  `#C4455A` on dark ones**: wine on ink measures only 1.8:1, light wine 3.8:1. Amber `#DB9A34` is the product's
  action colour (decision 016) and is not part of the logo.
- **Clear space and size:** keep free space of half the letter height on every side; at least about 56 px wide on
  screen.
- **Files in `assets/`:** `icon.png` (1024 px, RGB with no alpha channel: Apple rejects icons with one), the Android
  adaptive layers `android-icon-foreground.png` and `android-icon-monochrome.png` (1024 px RGBA, content inside the
  66% safe zone) and `android-icon-background.png` (solid ink), `favicon.png` (48 px, `Z.`), and the adaptive icon
  `backgroundColor` `#171412` in `app.json`. `tests/unit/app-icons.test.ts` guards the sizes and the alpha channel.
- **Source of truth:** the Figma file `5VgIX5jedu9gevBhkcs8Fb`, page Logo (frames "01 · Identidade padrão" and
  "02 · Ícones e splash"). The calendar-tile symbol stays there as archived frames ("Arquivo · …"), not in use.

## Consequences

- The splash is not wired: it needs `expo-splash-screen` and its configuration. The frame is ready in Figma.
- Inside the app the wordmark can be code (Oswald text plus a circular `View`), with no image asset.
- Do a trademark search (INPI) before locking the mark; the reference image was likely generated.
- Re-exporting from Figma: wordmark text must keep a line height of 100%. At 88% Figma clips the bottom overshoot of
  the round "C", which showed up as a flat-bottomed letter in the first icon export.
- Open: moving the repository to a company GitHub organisation (last, as agreed) and the shop-resolution
  sub-project from decision 015.
