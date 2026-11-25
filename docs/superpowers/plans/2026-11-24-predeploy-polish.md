# Pre-deploy polish batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, in this session, as for the multi-shop plan) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) the CEP lookup gives up on a hung service after 3 s and falls back to BrasilAPI; (2) `<html lang>` follows the active language; (3) the "switches stay green after Back to default" bug is fixed once its cause is confirmed on a device; (4) every common browser gets a working install path or nothing (Firefox Android guide, Safari 17+ gate), and the web app is smoke-tested on Firefox and WebKit; (5) the Jest run exits cleanly.

**Architecture:** No database change, no migration. Five small, independent code changes, each with its own tests and commit: `src/features/shops/cep.ts` (per-request limit), `src/i18n/` (listener on `languageChanged`), `tests/integration/app-providers.test.ts` (clear the QueryClients it leaks), `src/features/install/*` (one new state/variant, one stricter Safari check), `playwright.config.ts` (engine projects behind an env var). The theme fix is conditional (Task 5).

**Tech Stack:** TypeScript, React Native Web / Expo Router, i18next, react-query, Jest (jest-expo, RNTL), Playwright (system Chrome here).

**Spec:** `docs/superpowers/specs/2026-11-24-predeploy-polish-design.md`

**Branch:** `fix-predeploy-polish` (cut from `main` 0d8f304). Spec and plan are committed on it; the code commits follow, one per task. One PR against `main`, opened by the orchestrator.

## Global Constraints

- Wording: prose, comments, copy say "business" / "shop" (pt: estabelecimento / negócio), never "barbershop" / "barbearia".
- TDD: the failing test first, shown red, then the fix.
- No database touched: no migration, no pgTAP. If a task turns out to need one, stop and report (never `supabase db reset`).
- Gates after the last commit: `npm run typecheck; echo typecheck_exit=$?`, ROOT `npm run lint; echo lint_exit=$?` (read the output), full `npx jest --runInBand` (read the `Test Suites:` line **and** check there is no "Jest did not exit" warning), Playwright (chromium whole suite).
- Playwright on this machine: move `.env.local` aside, serve the static export (`CI=1 npm run e2e:export`, `npm run e2e:serve`), run with system Chrome through a throw-away config (`channel: "chrome"`, not committed), restore `.env.local` after. Do not run it against the Expo dev server (it died halfway last time).
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push.

## File map

| File | Responsibility |
|---|---|
| `src/features/shops/cep.ts` | `lookupCep` with a per-request time limit and the BrasilAPI fallback |
| `tests/unit/cep.test.ts` | lookup cases incl. timeouts (fake timers) |
| `src/i18n/language.ts` | `htmlLang(language)` pure mapping |
| `src/i18n/index.ts` | `applyHtmlLang` + listener on `languageChanged` |
| `tests/unit/html-lang.test.ts` | mapping and listener tests |
| `tests/e2e/language.web.spec.ts` (or the existing settings spec) | the page's `lang` follows the Settings choice |
| `tests/integration/app-providers.test.ts` | clear the QueryClients it creates (Jest exit) |
| `src/features/install/install-state.ts` | `installable-firefox-android` state, Safari 17+ gate |
| `src/features/install/InstallPrompt.tsx`, `InstallGuide.tsx` | the new card and guide variant |
| `src/i18n/locales/{pt,en,es}.ts` | three new `install.*` strings per language |
| `tests/unit/install-state.test.ts`, `install-prompt.test.ts` | user-agent table, card and guide |
| `tests/e2e/profile.web.spec.ts` | install card per user agent + screenshots |
| `src/components/ui/Toggle.tsx`, `tests/unit/toggle.test.ts` | Task 5 (conditional) |
| `playwright.config.ts` | `firefox` / `webkit` projects behind `PLAYWRIGHT_ENGINES=all` |

## Findings (read from the code, then run)

1. `lookupCep` (`src/features/shops/cep.ts`) calls `fetchFn(VIACEP(cep))` with no signal and no limit; it falls back only on a throw or a 5xx. `app/(owner)/shop.tsx:143` calls it as `void lookupCep(digits).then(...)`: the form is never blocked, but a hung request gives neither an address nor an error.
2. `app/+html.tsx:14` has `lang="pt-BR"`. Every language change goes through `src/i18n/index.ts` (`syncLanguage` → `i18n.changeLanguage`), called by `loadLanguagePreference` (AppProviders), `setLanguagePreference` (Settings) and the foreground `AppState` handler.
3. **Theme bug not reproduced** on web in three flows, and the provider → context → `Toggle` chain is correct under the native renderer (details in spec section 3). Task 5 therefore starts with a device repro by the user.
4. The install state machine already covers Chromium/Edge (captured `beforeinstallprompt`), every iOS browser, and Safari macOS; it has no Firefox Android case and shows the Add-to-Dock guide to every macOS Safari.
5. **Jest hang:** found by bisecting all 215 files one by one: only `tests/integration/app-providers.test.ts` leaves the process alive (an internal `new QueryClient()` with the default 5 min `gcTime`); `--detectOpenHandles` itself hangs without naming it. A scratch copy with an `afterAll` that clears the clients passes 12/12 and exits 0.
6. No Playwright browsers are installed on this machine (Chromium runs through the system Chrome); Firefox 160 is installed system-wide but Playwright cannot drive a stock Firefox.

## Open questions

See the spec's "Open questions" (theme repro device, static `lang` default, a Chromium menu hint, downloading the Playwright engines, real Safari/Firefox devices, the 6 s CEP worst case). Tasks 5 and 6 are gated on the answers to 1 and 4.

---

### Task 1: CEP lookup time limit

**Files:** `src/features/shops/cep.ts`, `tests/unit/cep.test.ts`

**Interfaces:**
- Produces: `export const CEP_TIMEOUT_MS = 3000;` and `lookupCep(cep: string, fetchFn: typeof fetch = fetch): Promise<CepResult>` unchanged in signature and result type; the injected `fetchFn` is now called as `fetchFn(url, { signal })`.

- [ ] **Step 1: Write the failing tests.** In `tests/unit/cep.test.ts`: change the two existing `toHaveBeenCalledWith(<url>)` assertions to `toHaveBeenCalledWith(<url>, { signal: expect.any(AbortSignal) })` (read the file first: every `toHaveBeenCalledWith` on a URL gets the second argument), import `CEP_TIMEOUT_MS`, and add:

```ts
describe("lookupCep time limit", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  // A request that only ends when it is aborted, like a hung connection.
  const hang = (url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  const brasil = { city: "São Paulo", neighborhood: "Bela Vista", state: "SP", street: "Avenida Paulista" };

  it("gives up on a hung ViaCEP after the limit and returns the BrasilAPI address", async () => {
    const fetchFn = jest.fn((url: string, init?: RequestInit) => (url.includes("viacep") ? hang(url, init) : Promise.resolve(respond(200, brasil))));
    const result = lookupCep("01310100", fetchFn as never);

    await jest.advanceTimersByTimeAsync(CEP_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ address: { city: "São Paulo", cityIbge: "", district: "Bela Vista", state: "SP", street: "Avenida Paulista" }, status: "found" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("is unavailable when both services hang (after one limit each)", async () => {
    const fetchFn = jest.fn(hang);
    const result = lookupCep("01310100", fetchFn as never);

    await jest.advanceTimersByTimeAsync(CEP_TIMEOUT_MS * 2);

    await expect(result).resolves.toEqual({ status: "unavailable" });
  });

  it("also limits a fetch that ignores the abort signal", async () => {
    const fetchFn = jest.fn(() => new Promise<Response>(() => undefined));
    const result = lookupCep("01310100", fetchFn as never);

    await jest.advanceTimersByTimeAsync(CEP_TIMEOUT_MS * 2);

    await expect(result).resolves.toEqual({ status: "unavailable" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("leaves no timer behind after a fast answer", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, viaCep));

    await lookupCep("01310100", fetchFn);

    expect(jest.getTimerCount()).toBe(0);
  });

  it("a ViaCEP erro does not go to the fallback", async () => {
    const fetchFn = jest.fn().mockResolvedValue(respond(200, { erro: true }));

    await expect(lookupCep("99999999", fetchFn)).resolves.toEqual({ status: "not-found" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `npx jest tests/unit/cep.test.ts` → the `signal` assertions and the hang cases fail (the lookup never resolves; the hang tests time out or reject on `advanceTimersByTimeAsync`).

- [ ] **Step 3: Implement** in `src/features/shops/cep.ts`: replace the body of `lookupCep` (keep `Found`, `CepResult`, the URL constants, `mergeCepResult`):

```ts
// Each request gets its own limit: a service that never answers must not hold the lookup (nor skip the fallback). The abort covers
// the headers and the body read; the race also covers a fetch that ignores the signal; the timer never outlives the request.
export const CEP_TIMEOUT_MS = 3000;

function withLimit<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("CEP_TIMEOUT"));
    }, CEP_TIMEOUT_MS);
  });

  return Promise.race([run(controller.signal), limit]).finally(() => clearTimeout(timer));
}

export async function lookupCep(cep: string, fetchFn: typeof fetch = fetch): Promise<CepResult> {
  try {
    const { body, ok, status } = await withLimit(async (signal) => {
      const response = await fetchFn(VIACEP(cep), { signal });

      return { body: response.ok ? ((await response.json()) as { bairro?: string; erro?: boolean | string; ibge?: string; localidade?: string; logradouro?: string; uf?: string }) : null, ok: response.ok, status: response.status };
    });

    if (ok && body) {
      if (body.erro) return { status: "not-found" };

      return { address: { city: body.localidade ?? "", cityIbge: body.ibge ?? "", district: body.bairro ?? "", state: body.uf ?? "", street: body.logradouro ?? "" }, status: "found" };
    }
    if (status < 500) return { status: "not-found" };
  } catch {
    // network error or time limit: try the fallback below
  }

  try {
    const { body, ok, status } = await withLimit(async (signal) => {
      const response = await fetchFn(BRASILAPI(cep), { signal });

      return { body: response.ok ? ((await response.json()) as { city?: string; neighborhood?: string; state?: string; street?: string }) : null, ok: response.ok, status: response.status };
    });

    if (status === 404) return { status: "not-found" };
    if (!ok || !body) return { status: "unavailable" };

    // BrasilAPI v2 has no IBGE code: the field stays empty after a fallback.
    return { address: { city: body.city ?? "", cityIbge: "", district: body.neighborhood ?? "", state: body.state ?? "", street: body.street ?? "" }, status: "found" };
  } catch {
    return { status: "unavailable" };
  }
}
```

- [ ] **Step 4: Run, expect PASS:** `npx jest tests/unit/cep.test.ts`; then `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`.

- [ ] **Step 5: Commit**

```bash
git add src/features/shops/cep.ts tests/unit/cep.test.ts
git commit -m "fix(shop): the CEP lookup gives up on a hung service after 3 s and tries the fallback" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `<html lang>` follows the language

**Files:** `src/i18n/language.ts`, `src/i18n/index.ts`, `tests/unit/html-lang.test.ts` (new), a Playwright spec (below)

**Interfaces:**
- Produces: `htmlLang(language: Language): string` in `language.ts` (`pt` → `"pt-BR"`, `en` → `"en"`, `es` → `"es"`); `src/i18n/index.ts` keeps `document.documentElement.lang` in step with `i18n.language` on the web client.

- [ ] **Step 1: Write the failing tests** `tests/unit/html-lang.test.ts`:

```ts
import i18n, { loadLanguagePreference, setLanguagePreference } from "../../src/i18n";
import { htmlLang } from "../../src/i18n/language";

describe("htmlLang", () => {
  it.each([["pt", "pt-BR"], ["en", "en"], ["es", "es"]] as const)("%s -> %s", (language, expected) => {
    expect(htmlLang(language)).toBe(expected);
  });
});

describe("document language", () => {
  const root = { lang: "" };

  beforeAll(() => {
    (globalThis as { document?: unknown }).document = { documentElement: root };
  });
  afterAll(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  it("follows i18n when the language changes", async () => {
    await i18n.changeLanguage("es");
    expect(root.lang).toBe("es");

    await i18n.changeLanguage("pt");
    expect(root.lang).toBe("pt-BR");
  });

  it("follows the Settings choice and the stored preference", async () => {
    await setLanguagePreference("en");
    expect(root.lang).toBe("en");

    await setLanguagePreference("pt");
    expect(root.lang).toBe("pt-BR");
    await loadLanguagePreference();
    expect(root.lang).toBe("pt-BR");
  });
});

describe("without a document (native, static export)", () => {
  it("changing the language does not throw", async () => {
    await expect(i18n.changeLanguage("en")).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`htmlLang` is not exported; `root.lang` stays `""`): `npx jest tests/unit/html-lang.test.ts`.

- [ ] **Step 3: Implement.** `src/i18n/language.ts`, append:

```ts
// The app's Portuguese is Brazilian; the other two are written without a region.
export function htmlLang(language: Language): string {
  return language === "pt" ? "pt-BR" : language;
}
```

`src/i18n/index.ts`: import `htmlLang`, and right after the `void i18n.use(initReactI18next).init({...})` block add:

```ts
// Web only (there is no document on native or in the static export's Node render): the page's own language follows the app's, at load
// and on every change (device language, stored preference, Settings choice, app foreground). Screen readers, hyphenation and the
// browser's "translate this page" read it.
function applyHtmlLang(language: string) {
  if (typeof document !== "undefined") document.documentElement.lang = htmlLang(resolveLanguage(language));
}

i18n.on("languageChanged", applyHtmlLang);
applyHtmlLang(i18n.language);
```

`app/+html.tsx`: leave `lang="pt-BR"` and extend the file's comment: "the static first-paint default; `src/i18n/index.ts` corrects it as soon as the bundle runs".

- [ ] **Step 4: Run, expect PASS:** `npx jest tests/unit/html-lang.test.ts tests/unit/html-head.test.ts`; typecheck; lint.

- [ ] **Step 5: Playwright (web).** Add to the settings/language spec that already exists (search `tests/e2e` for the Language setting; otherwise a new `tests/e2e/language.web.spec.ts` using an existing sign-in helper): the page opens with `locale: "en-US"` → `await expect(page.locator("html")).toHaveAttribute("lang", "en")`; choose Português in Settings > Language → `lang="pt-BR"`; reload → still `pt-BR` (stored preference). Run it with the static export (see Global Constraints).

- [ ] **Step 6: Commit**

```bash
git add src/i18n app/+html.tsx tests/unit/html-lang.test.ts tests/e2e
git commit -m "fix(i18n): the page's lang attribute follows the app language" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Jest exits cleanly

**Files:** `tests/integration/app-providers.test.ts`

- [ ] **Step 1: Show the red state.** `npx jest --runInBand tests/integration/app-providers.test.ts` (use `timeout 60`): all 12 pass and Jest prints "Jest did not exit one second after the test run has completed"; the command is cut by the timeout (exit 124).

- [ ] **Step 2: Fix.** After the imports/mocks and before `type ProfileSnapshot`, add:

```ts
// AppProviders makes its own QueryClient (default gcTime: 5 minutes). Every query it ran leaves a 5-minute garbage-collection timer
// after the test, and that timer keeps the Jest process alive. Clear every client that mounted so the run can exit.
const mounted: QueryClient[] = [];
const realMount = QueryClient.prototype.mount;

QueryClient.prototype.mount = function mount(this: QueryClient) {
  mounted.push(this);

  return realMount.call(this);
};

afterAll(() => {
  QueryClient.prototype.mount = realMount;
  for (const client of mounted) client.clear();
});
```

- [ ] **Step 3: Run, expect PASS and a clean exit:** `timeout 60 npx jest --runInBand tests/integration/app-providers.test.ts; echo exit=$?` → 12 passed, **no warning, exit=0**. Then the full run: `npx jest --runInBand 2>&1 | tail -8` → `Test Suites: 215 passed`, no "did not exit".

- [ ] **Step 4: Commit**

```bash
git add tests/integration/app-providers.test.ts
git commit -m "test: clear the QueryClients app-providers creates so Jest exits" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Install on every common browser

**Files:** `src/features/install/install-state.ts`, `InstallPrompt.tsx`, `InstallGuide.tsx`, `src/i18n/locales/{pt,en,es}.ts`, `tests/unit/install-state.test.ts`, `tests/unit/install-prompt.test.ts`, `tests/e2e/profile.web.spec.ts`

**Interfaces:**
- Produces: `InstallState` gains `{ status: "installable-firefox-android" }`; `InstallGuideVariant` gains `"firefox-android"`; `isMacSafari` requires Safari >= 17.

- [ ] **Step 1: Write the failing tests.** `tests/unit/install-state.test.ts`: add constants and rows to the existing `it.each` table:

```ts
const SAFARI_MAC_16 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15";
const FIREFOX_ANDROID = "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const EDGE_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
```

```ts
    ["Safari 16 on a Mac (no Add to Dock yet)", env({ userAgent: SAFARI_MAC_16 }), { status: "unsupported" }],
    ["Firefox on Android", env({ maxTouchPoints: 5, userAgent: FIREFOX_ANDROID }), { status: "installable-firefox-android" }],
    ["Firefox on Android that already fired a prompt (never happens, but the prompt wins)", env({ capturedPrompt: prompt, userAgent: FIREFOX_ANDROID }), { promptEvent: prompt, status: "installable-chrome" }],
    ["Edge on Android without a prompt", env({ userAgent: EDGE_ANDROID }), { status: "unsupported" }],
    ["Samsung Internet without a prompt", env({ userAgent: SAMSUNG }), { status: "unsupported" }],
    ["a Safari whose version cannot be read", env({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15" }), { status: "unsupported" }],
```

(`Firefox` desktop stays the existing "unsupported" row.) `tests/unit/install-prompt.test.ts`: add

```ts
  it("shows the Firefox Android card and its two-step guide", async () => {
    state({ status: "installable-firefox-android" });
    const view = await render(React.createElement(InstallPrompt));

    await fireEvent.press(view.getByTestId("install-card"));

    expect(view.getByText("Install the app")).toBeTruthy();
    expect(view.getByText("Tap the browser menu (⋮)")).toBeTruthy();
    expect(view.getByText("Tap “Install” (or “Add to Home screen”)")).toBeTruthy();
  });
```

and, in the `InstallGuide` describe, a case for `variant="firefox-android"` (same shape as the existing variants' tests).

- [ ] **Step 2: Run, expect FAIL:** `npx jest tests/unit/install-state.test.ts tests/unit/install-prompt.test.ts`.

- [ ] **Step 3: Implement.**

`install-state.ts`: add `| { status: "installable-firefox-android" }` to `InstallState`; then

```ts
// "Add to Dock" arrived with Safari 17 (macOS Sonoma). An unreadable version counts as too old: show nothing rather than a guide
// for a menu item that may not exist.
const safariMajor = (env: InstallEnvironment) => Number(/version\/(\d+)/.exec(lower(env))?.[1] ?? 0);
```

change `isMacSafari` to end with `&& safariMajor(env) >= 17`, add

```ts
// Firefox for Android installs a web app from its menu ("Install"); it never fires beforeinstallprompt.
const isFirefoxAndroid = (env: InstallEnvironment) => /android/.test(lower(env)) && /firefox\//.test(lower(env)) && !/seamonkey/.test(lower(env));
```

and in `resolveInstallState`, after the `isMacSafari` line: `if (isFirefoxAndroid(env)) return { status: "installable-firefox-android" };`.

`InstallGuide.tsx`: `InstallGuideVariant = "firefox-android" | "ios-chrome" | "ios-other" | "mac-safari"`; import `EllipsisVertical`; steps for the new variant `[{ icon: icon(EllipsisVertical), text: t("install.stepFirefoxMenu") }, { icon: icon(SquarePlus), text: t("install.stepFirefoxInstall") }]`; title `variant === "mac-safari" ? t("install.macTitle") : variant === "firefox-android" ? t("install.firefoxTitle") : t("install.iosTitle")`.

`InstallPrompt.tsx`: replace the last block's `mac`/`variant`:

```tsx
  const mac = install.status === "installable-mac-safari";
  const firefox = install.status === "installable-firefox-android";
  const variant = mac ? "mac-safari" : firefox ? "firefox-android" : install.browser === "chrome" ? "ios-chrome" : "ios-other";
```

and the card body `mac ? t("install.macBody") : t("install.iosBody")` stays (Firefox reuses `iosBody`: "Open Zenc straight from your home screen."). Update the comment above the component ("Chrome gets the browser's own prompt; iPhone/iPad, Safari 17+ on Mac and Firefox on Android get a short guide; everything else shows nothing").

Locales (alphabetical order inside `install`, as the file keeps it): en `firefoxTitle: "Install the app"`, `stepFirefoxInstall: "Tap “Install” (or “Add to Home screen”)"`, `stepFirefoxMenu: "Tap the browser menu (⋮)"`; pt `firefoxTitle: "Instalar o app"`, `stepFirefoxInstall: "Toque em “Instalar” (ou “Adicionar à tela inicial”)"`, `stepFirefoxMenu: "Toque no menu (⋮) do navegador"`; es `firefoxTitle: "Instalar la app"`, `stepFirefoxInstall: "Toca “Instalar” (o “Añadir a pantalla de inicio”)"`, `stepFirefoxMenu: "Toca el menú (⋮) del navegador"`.

- [ ] **Step 4: Run, expect PASS:** the two files plus `tests/unit/locale-parity.test.ts` and `use-install-prompt.test.ts`; typecheck; lint.

- [ ] **Step 5: Playwright + screenshots (web, 390 px).** In `tests/e2e/profile.web.spec.ts`, with `test.use({ userAgent })` per case on the customer profile hub: Firefox Android UA → `install-card` visible, press opens `install-guide` with the two steps; Firefox desktop UA → `install-card` count 0; Safari 16 macOS UA → count 0; Safari 17 macOS UA → card visible. Take a screenshot of the card per case and assert its computed style equals the iOS card's (`border-radius 20px`, `min-height 56px`, `padding 16px`, 1px border).

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "feat(install): a guide for Firefox on Android, and Add to Dock only where Safari has it" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Theme bug: switches stay green after "Back to default" (CONDITIONAL)

**Gate:** needs the device repro below. Do **not** implement the fix before the user (or the orchestrator for them) confirms it reproduces on a device and which one. If it reproduces only on web with different steps, stop and update the spec.

**Files (if confirmed native):** `src/components/ui/Toggle.tsx`, `tests/unit/toggle.test.ts`

**Device repro (two minutes, for the user):**
1. Expo Go (or the dev build) on the phone, `owner@teste.com`, Manage > App appearance: pick a green for **Primary colour**, tap Save.
2. Account > Settings: the notification / "owner as professional" switch is green. Sign out, sign in as the customer of the same shop, look at the colours, sign out, sign in as the owner.
3. Manage > App appearance > "Back to the Zenc default" > confirm. Account > Settings: **is the switch amber (default) or still green?** Note the platform (Android or iPhone), whether the switch was on, and whether anything stopped responding (the "freeze").
4. Repeat the same in the phone's browser; if the switch is wrong there too, send the exact steps.

- [ ] **Step 1: Regression test for the chain (always, no gate)** in `tests/unit/toggle.test.ts`:

```ts
import { AppThemeProvider } from "../../src/lib/design/theme/ThemeProvider";

  it("follows the theme from a chosen colour back to the default", async () => {
    const tree = (primary: string | null) =>
      React.createElement(AppThemeProvider, { input: { primary } }, React.createElement(Toggle, { testID: "t", value: true }));
    const view = await render(tree("#2F9E5B"));
    const onTrack = () => (view.getByTestId("t").props as Record<string, unknown>).onTintColor;

    expect(onTrack()).toBe("#2F9E5B");
    await view.rerender(tree(null));

    expect(onTrack()).toBe(DEFAULT_COLORS.primary[400]);
  });
```

This passes today (evidence in the spec); it stays as a guard.

- [ ] **Step 2 (only if the device repro shows a native switch keeping its old track): failing test.** In the same file:

```ts
  it("remounts when the track colour changes, so a native switch cannot keep the old track", async () => {
    const ref = jest.fn();
    const tree = (primary: string | null) =>
      React.createElement(AppThemeProvider, { input: { primary } }, React.createElement(Toggle, { ref, testID: "t", value: true }));
    const view = await render(tree("#2F9E5B"));
    const mounts = () => ref.mock.calls.filter(([instance]) => instance).length;

    await view.rerender(tree(null));

    expect(mounts()).toBe(2);
  });
```

Run: FAIL (`mounts()` is 1).

- [ ] **Step 3: Fix** in `src/components/ui/Toggle.tsx`: `<Switch key={colors.primary[400]} {...props} ... />` with the comment "A switch is a leaf: remounting it when the theme changes loses nothing (its state is the `value` prop) and guarantees a native switch repaints its track."

- [ ] **Step 4:** run `tests/unit/toggle.test.ts` (PASS), typecheck, lint; ask the user to repeat the device repro; commit:

```bash
git add src/components/ui/Toggle.tsx tests/unit/toggle.test.ts
git commit -m "fix(ui): a switch remounts when the theme changes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

If the repro does **not** need the fix, commit Step 1 alone ("test(ui): a Toggle follows the theme back to the default") and record in the PR that the bug was not reproduced.

---

### Task 6: Engine smoke check: Firefox and WebKit (GATED on open question 4)

**Gate:** needs permission to download the engines (`npx playwright install firefox webkit`, about 200 to 300 MB). Without it, skip the run and keep Step 1 only.

**Files:** `playwright.config.ts`, specs that need an engine-specific skip

- [ ] **Step 1: Projects behind an env var.** In `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

// `PLAYWRIGHT_ENGINES=all` runs the suite on the three engines (a manual pre-deploy check); the default stays one project.
const engines = process.env.PLAYWRIGHT_ENGINES === "all";

export default defineConfig({
  projects: engines
    ? [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
        { name: "webkit", use: { ...devices["Desktop Safari"] } },
      ]
    : undefined,
  // ...existing testDir, retries, use
});
```

Check the default run is unchanged (`npx playwright test --list | tail -1` still 275 tests).

- [ ] **Step 2 (needs the download):** `npx playwright install firefox webkit`, then with the static export served: `PLAYWRIGHT_ENGINES=all npx playwright test --project=firefox --project=webkit 2>&1 | tail -40`. Write the failures into a table (spec, engine, error, class: real compatibility bug / Playwright-engine difference).

- [ ] **Step 3: Fix the real ones** (CSS or API support) each with its own failing test first; for engine differences (web push permission, service worker, `beforeinstallprompt`) add `test.skip(({ browserName }) => browserName !== "chromium", "<why>")` with the reason.

- [ ] **Step 4: Commit** (`test(e2e): firefox and webkit projects behind PLAYWRIGHT_ENGINES` plus one commit per real fix). Report the table and what remains manual: real iPhone/Mac Safari and Firefox Android.

---

### Task 7: Final gate and handoff

- [ ] **Step 1:** `npm run typecheck; echo typecheck_exit=$?`, `npm run lint; echo lint_exit=$?` (read the output), `npx jest --runInBand` (read `Test Suites:` and confirm **no "did not exit" line**), Playwright chromium whole suite on the static export. Re-run after the last commit. pgTAP is not needed (no database change); say so.
- [ ] **Step 2:** Verify the UI in the browser for items 3 and 4: screenshots at 390 px, computed CSS (install card per user agent; switch track colour after a reset).
- [ ] **Step 3:** Report: commits, gate numbers, the Task 5 and Task 6 status, open questions. Do not push; the orchestrator pushes and opens the PR.
