# Decision 016: Per-shop colour theme

Date: 2026-11-11
Status: accepted

## Context

Zenc serves many beauty businesses from one binary. Each should be able to use its own colours without a build
per shop. The app is light-only; the status colours must mean the same everywhere.

## Decision

- Three optional colours per shop: **primary** (identity), **accent** (filled action buttons), **base** (a tint for the
  light surfaces and text). Null means the Zenc default; a null accent follows the primary.
- Tailwind colour tokens read CSS variables (`rgb(var(--c-…) / <alpha-value>)`). The default palette lives in
  `src/lib/design/colors.ts` (`DEFAULT_COLORS`) and `global.css` (a test keeps them equal).
- `deriveTheme` (pure, `src/lib/design/theme/derive.ts`) builds every scale from up to three hex values in OKLCH and
  guarantees contrast by construction: label on fill >= 4.5, `primary-600` on `canvas` >= 4.5, `neutral-500…900` and
  `ink` on `canvas`/`surface` >= 4.5. A colour with no hue (black, grey, white) yields a neutral scale. Known gap in the
  untouched default: `primary-600` on `canvas` is 4.31 (4.69 on `surface`); it is left as is to keep today's look.
- `AppThemeProvider` writes the variables on `<html>` on the web (react-native-web renders `Modal` into `document.body`,
  outside the app root) and uses NativeWind `vars()` on a root View on native, where React context crosses `Modal`.
  On native the default palette is always applied through `vars()` too.
- JS code that needs a colour calls `useColors()`; danger/success/warning/white, chart colours, status bar, splash and
  icon are fixed. The dark `ink` surface (selected day, dark button) stays tied to the base.

## Consequences

- No dark mode per shop (separate project). No logo upload. The theme applies after sign-in; the pre-sign-in theme per
  `<slug>.zencpro.app` belongs to the shop-resolution sub-project.
- `vars()` on a real device is not verified by automated tests (the web export is, in Playwright): check on a phone
  after the first build that includes this change.
- Colour in JS must go through `useColors()`; a literal hex in a component bypasses the theme.
