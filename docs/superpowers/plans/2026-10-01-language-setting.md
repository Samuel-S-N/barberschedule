# Language setting (Follow device / Português / Español / English) — plan

> Executed inline with TDD on branch `feat-profile-tab`. Amends `docs/decisions/012-device-language.md` ("no in-app picker").

**Goal:** a language block in Profile > Settings: Follow device, Português, Español, English. The choice applies at once to the whole app and is kept on this device.

**Architecture:** a pure `LanguagePreference` layer in `src/i18n` (resolve, parse), module state + persistence in `src/i18n/index.ts` (`load/set/getLanguagePreference`, `syncLanguage` honours it), storage reused from the existing Supabase storage helper (moved to `src/lib/key-value-storage.ts` so i18n does not import the Supabase client), `AppProviders` loads the preference before the first screen, a new `RadioBlock` component and the block in `me/settings.tsx`.

**Spec:** the design approved in chat on 2026-09-30/10-01 (bounded, no spec file).

## Global constraints

- Preference is per device (not per account), values `device | pt | es | en`, key `barberschedule.language`. Default and unreadable storage mean `device`.
- With `device` the app keeps re-reading the device language on foreground; with an explicit language that re-read must not override it.
- Language names are shown in their own language; all copy in pt, en, es (`locale-parity` and `no-hardcoded-text` guards).
- Out of scope: pickers in the owner/barber screens, push-notification locale (token registration is not wired yet; ADR 012 already says it must re-register on a language change when it is).
- Other people's uncommitted edits exist in this checkout (booking review screen, `format.ts`, `TimeSlotPicker`, `reviewTitle` copy): never `git add -A`; stage only this plan's files and only this plan's hunks in the locale files.
- Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Commands through `rtk`.

## Task 1 — pure preference logic (`src/i18n/language.ts`)

Tests first in `tests/unit/language.test.ts`:

```ts
import { effectiveLanguage, parseLanguagePreference } from "../../src/i18n/language";

describe("language preference", () => {
  it.each([["pt", "pt"], ["es", "es"], ["en", "en"], ["device", "device"], ["fr", "device"], ["", "device"], [null, "device"], [undefined, "device"]])(
    "parses %p as %p", (raw, expected) => expect(parseLanguagePreference(raw)).toBe(expected));

  it("follows the device only for the device preference", () => {
    expect(effectiveLanguage("device", "pt-BR")).toBe("pt");
    expect(effectiveLanguage("device", "fr")).toBe("en");
    expect(effectiveLanguage("es", "pt-BR")).toBe("es");
  });
});
```

Implementation added to `language.ts`:

```ts
export type LanguagePreference = "device" | Language;

export function parseLanguagePreference(value: string | null | undefined): LanguagePreference {
  return value === "pt" || value === "es" || value === "en" ? value : "device";
}

export function effectiveLanguage(preference: LanguagePreference, deviceCode: string | null | undefined): Language {
  return preference === "device" ? resolveLanguage(deviceCode) : preference;
}
```

## Task 2 — storage module and persistence (`src/lib/key-value-storage.ts`, `src/i18n/index.ts`)

- Move `createMemoryStorage`, `getWebStorage`, `createSupabaseStorage` and the `SupabaseStorage`/`WebStorage` types from `src/lib/supabase/client.ts` into `src/lib/key-value-storage.ts` (exported as `createKeyValueStorage`); `client.ts` imports it and keeps exporting `createSupabaseStorage` as the same function so existing tests and callers do not change.
- Tests first, `tests/integration/language-preference.test.ts`, with `jest.mock("../../src/lib/key-value-storage")` returning an in-memory store and `expo-localization` mocked like `tests/unit/i18n-init.test.ts`:
  - `loadLanguagePreference` with a saved `"pt"` switches to Portuguese although the device is English;
  - with nothing saved, or a storage that throws, it stays on the device language;
  - `setLanguagePreference("es")` changes the language at once and saves `"es"` under `barberschedule.language`;
  - `syncLanguage` keeps an explicit language when the device language differs, and follows the device again after `setLanguagePreference("device")`;
  - `getLanguagePreference` reflects the last value.
- Implementation in `src/i18n/index.ts`:

```ts
const PREFERENCE_KEY = "barberschedule.language";
const storage = createKeyValueStorage();
let preference: LanguagePreference = "device";

function targetLanguage() {
  return effectiveLanguage(preference, getLocales()[0]?.languageCode);
}

export function getLanguagePreference() {
  return preference;
}

export async function syncLanguage() {
  const next = targetLanguage();

  if (next !== i18n.language) {
    await i18n.changeLanguage(next);
  }
}

export async function loadLanguagePreference() {
  try {
    preference = parseLanguagePreference(await storage.getItem(PREFERENCE_KEY));
  } catch {
    preference = "device";
  }

  await syncLanguage();
}

export async function setLanguagePreference(next: LanguagePreference) {
  preference = next;
  await storage.setItem(PREFERENCE_KEY, next).catch(() => undefined); // ponytail: applies for this session only if storage fails
  await syncLanguage();
}
```

(`init` keeps `lng: deviceLanguage()`; the saved preference is applied right after by `loadLanguagePreference`.)

## Task 3 — load before the first screen (`src/providers/AppProviders.tsx`)

Test first in `tests/integration/app-providers-i18n.test.ts`: with a saved `"es"` and an English device, the provider reports loading until the preference is applied and then renders Spanish. Implementation: `languageReady` state set when `loadLanguagePreference()` settles (success or failure); the context exposes `isLoading: isLoading || !languageReady`. The foreground listener keeps calling `syncLanguage()`.

## Task 4 — `RadioBlock` and the hook

Test first in `tests/unit/profile-components.test.ts`: renders one row per item, marks the selected one (`accessibilityState.checked`), fires `onPress`, row test ids `option-<key>`. Component `src/components/domain/RadioBlock.tsx` (same card look as `MenuBlock`, `Check` icon on the selected row, `accessibilityRole="radio"`), exported from `domain/index.ts` (and `component-exports.test.ts`). Hook `useLanguagePreference()` in `src/i18n/use-language.ts`: `[preference, choose]`, local state initialised from `getLanguagePreference()` and updated before awaiting `setLanguagePreference`.

## Task 5 — Settings screen and copy

- `app/(customer)/me/settings.tsx`: a "Language" heading and a `RadioBlock` with `device`, `pt`, `es`, `en`.
- Copy under `profile.settings` in pt/en/es: `language` ("Idioma" / "Language" / "Idioma"), `languageDevice` ("Seguir o dispositivo" / "Follow device" / "Seguir el dispositivo"), `languageNames` `{ pt: "Português", es: "Español", en: "English" }` (same text in every locale).
- e2e in `tests/e2e/profile.web.spec.ts`: on `/me/settings` choose Español → heading "Configuración"; reload → still "Configuración"; choose Follow device → "Settings" again.

## Task 6 — docs and verification

- ADR 012: replace "There is no in-app picker" with the picker, per-device preference and the foreground rule; keep the push-registration note.
- `docs/project-status.md`: Task 21 entry.
- typecheck, lint, Jest, `npm run test:db`, e2e (with `.env.local` aside), local validation; then commit only this work, push, open the PR from `feat-profile-tab`.
