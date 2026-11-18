# Installable web app (multi-shop, part 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zenc on the web can be added to the phone's home screen: a manifest and icons, a minimal service worker, the iOS/Android tags, and an "Install" card on every role's profile hub that works on Chrome/Android/Edge, any browser on iPhone and iPad, and Safari on Mac.

**Architecture:** Static files in `public/` (Expo copies them to the web export root) plus `app/+html.tsx` for the head tags and an inline script that captures `beforeinstallprompt` before the bundle mounts. A pure `resolveInstallState(environment)` decides which card the visitor sees; `useInstallPrompt()` wraps it with the two browser events; `InstallPrompt` renders the card and `InstallGuide` the centred "how to add it" window. Part 4 (web push) reuses `public/sw.js`, `useInstallPrompt` and `InstallGuide`.

**Tech Stack:** Expo SDK 58 static web export (Expo Router `+html`), React Native web, NativeWind, lucide-react-native, Jest (jest-expo, RNTL 14 async `render`/`renderHook`), Playwright (system Chrome). Python PIL (already installed) only for generating the icon PNGs once.

**Spec:** `docs/superpowers/specs/2026-11-18-installable-web-app-design.md`

**Branch:** `feat-installable-web`, cut from `feat-shop-onboarding` after part 2 is complete (`git checkout -b feat-installable-web feat-shop-onboarding`). Part 4 stacks on it as `feat-web-push`.

**Prerequisites from parts 1 and 2:** shop subdomains (`*.localhost` for local browser checks, the Playwright fixture `tests/e2e/fixtures.ts` exporting `test`, `expect`, `defaultShop`); no migrations are needed in this part (next free migration number stays **0072**, pgTAP **054**).

**Reference (read-only, never edited):** `~/projects/fitbrother/apps/mobile/lib/hooks/useInstallPrompt.ts`, `components/domain/InstallPrompt.tsx`, `public/sw.js`, `public/manifest.json`. Fitbrother has hard-coded Portuguese and its own colour tokens; this plan ports the logic and restyles with Zenc's components and `t()` texts.

## Open questions for the orchestrator

None changes the approved design; each says what this plan does meanwhile.

1. **The owner's profile hub is `app/(owner)/settings.tsx` (the Account tab), not `app/(owner)/owner-profile`.** `owner-profile/` holds the inner screens (account, security, privacy, settings, about). The spec's third hub path is therefore read as `settings.tsx`. The customer hub is `app/(customer)/(tabs)/profile.tsx` and the professional hub `app/(professional)/my-profile/index.tsx`, as the spec says.
2. **A custom `app/+html.tsx` replaces Expo's default document head.** It must re-add what the default provided (charset, `X-UA-Compatible`, the viewport, `ScrollViewStyleReset` from `expo-router/html`). **Plan does:** the viewport also gets `viewport-fit=cover`. Without it, `apple-mobile-web-app-status-bar-style=black-translucent` (a spec requirement) draws the page under the iPhone status bar and `env(safe-area-inset-*)` stays 0, so the existing `Screen` component (which pads by `useSafeAreaInsets()`) would not clear it. The user's iPhone check (spec, Testing) covers this.
3. **Service workers and the e2e suite.** A registered service worker can interfere with Playwright's `page.route` mocks, which all 50 specs rely on. **Plan does:** Playwright runs with `serviceWorkers: "block"` for the whole suite and only the new `pwa.web.spec.ts` opts in (`test.use({ serviceWorkers: "allow" })`). No production code changes for this.
4. **`<html lang>`** is set to `pt-BR` (the product's main market and the manifest's `lang`); the app switches its own language at runtime. If you prefer `en` (Expo's default) it is one word in `app/+html.tsx`.
5. **The install card is mounted separately on each hub** (three one-line edits) instead of through a shared wrapper: part 4 adds its notification card next to it in the same three places, and an empty wrapper would leave a blank gap in browsers that show no card.

## Global Constraints

- The installed app is always named **Zenc** with the Zenc icon on every shop subdomain: one static manifest, no per-shop server.
- `public/manifest.json`: `name`/`short_name` "Zenc", `start_url` "/", `scope` "/", `display` "standalone", `orientation` "portrait", `lang` "pt-BR", `background_color` and `theme_color` `#171412` (ink, decision 017), icons 192 and 512 (`purpose: any`) and 192 and 512 (`purpose: maskable`).
- `public/icons/`: those four PNGs plus `apple-touch-icon.png` (180), generated once from `assets/icon.png` and committed; the maskable ones keep the wordmark inside the safe zone on the ink background.
- `public/sw.js`: minimal, **no offline cache** in this part, registered on web at app start; part 4 adds its push handlers.
- `app/+html.tsx` adds: `<link rel="manifest">`, Apple tags (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` `black-translucent`, title "Zenc", `apple-touch-icon`), `theme-color`, and an inline script capturing `beforeinstallprompt` into `window.__zencInstallPromptEvent` as early as possible (Chrome can fire it before the bundle mounts and fires it once).
- States of the card: native app or already standalone → nothing; Chrome/Android/Edge with a captured prompt → card "Install the app" with an **Install** button calling the browser's own prompt; any browser on iPhone/iPad → card "Add to Home Screen" opening a 2-step guide (Chrome iOS: menu ⋯ → Add to Home Screen; others: Share, or the browser menu first → Add to Home Screen); Safari on Mac → card "Add to Dock" with a 2-step guide; anything else → nothing. The guide is a centred floating window with an X and close-on-tap-outside (project pop-up style).
- Shown only on the profile hub of every role (customer, professional, owner); never automatically.
- Texts in pt/es/en (`src/i18n/locales/{en,pt,es}.ts`, parity enforced by `tests/unit/locale-parity.test.ts`); colours only through tokens/`className` (no hex literals in components; the ink `#171412` appears only in `manifest.json`, `+html.tsx` and the icon script); every `<Input>` needs a placeholder (no inputs here); new routes need `parents.ts` (this part adds **no** route).
- Checks after every task: `npx tsc --noEmit`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named. Playwright (system Chrome, `.env.local` moved aside, procedure in part 1 Task 14) when screens or the export change.

## File structure

| File | Responsibility |
|---|---|
| `public/manifest.json`, `public/icons/*.png`, `public/sw.js` (new) | the installable web app assets |
| `app/+html.tsx` (new) | static document head: manifest, Apple tags, theme colour, install-prompt capture, viewport |
| `src/features/install/capture-script.ts` (new) | the inline script as a string (testable) |
| `src/features/install/install-state.ts` (new) | pure `resolveInstallState`, `isIos`, `iosGuideBrowser`, `InstallEnvironment` |
| `src/features/install/environment.ts` (new) | `readInstallEnvironment()` reads `Platform`, `window`, `navigator` |
| `src/features/install/use-install-prompt.ts` (new) | `useInstallPrompt()` |
| `src/features/install/InstallGuide.tsx`, `InstallPrompt.tsx` (new) | the guide window and the card |
| `src/lib/pwa/register-sw.ts` (new) | `registerServiceWorker()` called from `AppProviders` |
| `app/(customer)/(tabs)/profile.tsx`, `app/(professional)/my-profile/index.tsx`, `app/(owner)/settings.tsx` (modify) | mount the card |
| `tests/e2e/pwa.web.spec.ts` (new), `playwright.config.ts`, `playwright.chrome.config.ts` (modify) | browser checks |

---

### Task 1: Manifest and icons

**Files:**
- Create: `public/manifest.json`, `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`
- Test: `tests/unit/pwa-manifest.test.ts`

**Interfaces:**
- Produces: `GET /manifest.json` and `/icons/*.png` at the web export root.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pwa-manifest.test.ts`:

```ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "public");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as {
  background_color: string; display: string; icons: Array<{ purpose: string; sizes: string; src: string; type: string }>;
  lang: string; name: string; orientation: string; scope: string; short_name: string; start_url: string; theme_color: string;
};

// A PNG starts with an 8-byte signature, then the IHDR chunk: width and height are the two 32-bit numbers at bytes 16 and 20.
function pngSize(file: string) {
  const bytes = readFileSync(file);

  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

describe("public/manifest.json", () => {
  it("names the app Zenc and opens it standalone at the root", () => {
    expect(manifest).toMatchObject({
      background_color: "#171412", display: "standalone", lang: "pt-BR", name: "Zenc", orientation: "portrait",
      scope: "/", short_name: "Zenc", start_url: "/", theme_color: "#171412",
    });
  });

  it("declares 192 and 512 icons, each as any and as maskable", () => {
    const declared = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`).sort();

    expect(declared).toEqual(["192x192:any", "192x192:maskable", "512x512:any", "512x512:maskable"]);
  });

  it.each(manifest.icons)("$src exists and has the declared size", (icon) => {
    const file = join(root, icon.src.replace(/^\//, ""));
    const [width, height] = icon.sizes.split("x").map(Number);

    expect(existsSync(file)).toBe(true);
    expect(icon.type).toBe("image/png");
    expect(pngSize(file)).toEqual({ height, width });
  });

  it("ships the 180px Apple touch icon", () => {
    expect(pngSize(join(root, "icons", "apple-touch-icon.png"))).toEqual({ height: 180, width: 180 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/pwa-manifest.test.ts`
Expected: FAIL (`ENOENT ... public/manifest.json`).

- [ ] **Step 3: Create the manifest and generate the icons**

Create `public/manifest.json`:

```json
{
  "name": "Zenc",
  "short_name": "Zenc",
  "description": "Agendamento para o setor de beleza.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "lang": "pt-BR",
  "dir": "ltr",
  "background_color": "#171412",
  "theme_color": "#171412",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Generate the five PNGs once from `assets/icon.png` (1024 px, the wordmark on the ink background `#171412`). The "any" icons are plain resizes. The maskable ones scale the artwork to 80 % on an ink canvas, because Android may crop everything outside the central 80 % circle and the wordmark's corners sit at 42 % of the width from the centre at full size:

```bash
mkdir -p public/icons && python3 - <<'PY'
from PIL import Image

source = Image.open("assets/icon.png").convert("RGB")
INK = (0x17, 0x14, 0x12)

def plain(size, name):
    source.resize((size, size), Image.LANCZOS).save(f"public/icons/{name}", optimize=True)

def maskable(size, name):
    canvas = Image.new("RGB", (size, size), INK)
    inner = round(size * 0.80)
    art = source.resize((inner, inner), Image.LANCZOS)
    canvas.paste(art, ((size - inner) // 2, (size - inner) // 2))
    canvas.save(f"public/icons/{name}", optimize=True)

plain(192, "icon-192.png"); plain(512, "icon-512.png"); plain(180, "apple-touch-icon.png")
maskable(192, "icon-maskable-192.png"); maskable(512, "icon-maskable-512.png")
PY
```

Open `public/icons/icon-maskable-512.png` with the Read tool and check the wordmark clears the circle inscribed at 80 % (all four letters and the dot well inside, margin on every side).

- [ ] **Step 4: Run it and see it pass**

Run: `npx jest tests/unit/pwa-manifest.test.ts`
Expected: PASS (all rows).

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add public tests/unit/pwa-manifest.test.ts
git commit -m "feat(web): manifest and icons for the installable app"
```

---

### Task 2: Minimal service worker and its registration

**Files:**
- Create: `public/sw.js`, `src/lib/pwa/register-sw.ts`
- Modify: `src/providers/AppProviders.tsx` (one effect)
- Test: `tests/unit/service-worker.test.ts`, `tests/unit/register-sw.test.ts`

**Interfaces:**
- Produces: `registerServiceWorker(deps?: { platform?: string; serviceWorker?: Pick<ServiceWorkerContainer, "register"> | undefined }): Promise<void>` — web only, never throws; registers `/sw.js` with scope `/`.
- `public/sw.js` listens to `install` (`skipWaiting`), `activate` (`clients.claim`) and a no-op `fetch` (Chrome's installability needs the listener); part 4 adds `push` and `notificationclick` to this same file.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/service-worker.test.ts` (runs `public/sw.js` against a fake service worker scope):

```ts
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

function load() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const self = {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => { listeners[type] = listener; },
    clients: { claim: jest.fn().mockResolvedValue(undefined) },
    skipWaiting: jest.fn(),
  };

  vm.runInNewContext(readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8"), { self });

  return { listeners, self };
}

describe("public/sw.js", () => {
  it("has the fetch listener Chrome needs to offer installation, and does not answer requests (no cache)", () => {
    const { listeners } = load();
    const respondWith = jest.fn();

    expect(typeof listeners.fetch).toBe("function");
    listeners.fetch({ respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("activates immediately and claims open tabs", () => {
    const { listeners, self } = load();
    const waitUntil = jest.fn();

    listeners.install({});
    listeners.activate({ waitUntil });

    expect(self.skipWaiting).toHaveBeenCalled();
    expect(self.clients.claim).toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalled();
  });
});
```

Create `tests/unit/register-sw.test.ts`:

```ts
import { registerServiceWorker } from "../../src/lib/pwa/register-sw";

describe("registerServiceWorker", () => {
  it("registers /sw.js at the root scope on web", async () => {
    const register = jest.fn().mockResolvedValue({});

    await registerServiceWorker({ platform: "web", serviceWorker: { register } });

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does nothing on native", async () => {
    const register = jest.fn();

    await registerServiceWorker({ platform: "ios", serviceWorker: { register } });

    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", async () => {
    await expect(registerServiceWorker({ platform: "web", serviceWorker: undefined })).resolves.toBeUndefined();
  });

  it("never throws when registration fails", async () => {
    const register = jest.fn().mockRejectedValue(new Error("insecure context"));

    await expect(registerServiceWorker({ platform: "web", serviceWorker: { register } })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/service-worker.test.ts tests/unit/register-sw.test.ts`
Expected: FAIL (`ENOENT public/sw.js`, module not found).

- [ ] **Step 3: Implement**

Create `public/sw.js`:

```js
// Minimal service worker: it exists so the browser offers installation (Chrome requires a registered worker with a "fetch"
// listener). It deliberately caches nothing: the app depends on live Supabase data and a stale cache would serve old answers.
// Offline support would need its own design (cache only the static bundle, never API responses).
// Web push (multi-shop part 4) adds its `push` and `notificationclick` handlers below.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty: without event.respondWith() the browser uses the network as usual.
});
```

Create `src/lib/pwa/register-sw.ts`:

```ts
import { Platform } from "react-native";

type Deps = { platform?: string; serviceWorker?: Pick<ServiceWorkerContainer, "register"> | undefined };

// Web only. Registration is best effort: an insecure context or a blocked worker must never break the app.
export async function registerServiceWorker({
  platform = Platform.OS,
  serviceWorker = typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
}: Deps = {}): Promise<void> {
  if (platform !== "web" || !serviceWorker) return;

  try {
    await serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // ignored on purpose
  }
}
```

`src/providers/AppProviders.tsx`: add the import `import { registerServiceWorker } from "../lib/pwa/register-sw";` and, next to the other mount effects, `useEffect(() => { void registerServiceWorker(); }, []);`.

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest tests/unit/service-worker.test.ts tests/unit/register-sw.test.ts tests/integration/app-providers.test.ts`
Expected: PASS (the provider test still passes: on the Jest `ios` platform the call is a no-op).

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add public/sw.js src/lib/pwa/register-sw.ts src/providers/AppProviders.tsx tests/unit/service-worker.test.ts tests/unit/register-sw.test.ts
git commit -m "feat(web): minimal service worker registered at app start"
```

---

### Task 3: The document head — `app/+html.tsx` and the install-prompt capture script

**Files:**
- Create: `src/features/install/capture-script.ts`, `app/+html.tsx`
- Test: `tests/unit/install-capture.test.ts`, `tests/unit/html-head.test.ts`; Modify: `tests/unit/route-parents-coverage.test.ts` (ignore `+html`)

**Interfaces:**
- Produces: `INSTALL_CAPTURE_SCRIPT: string` (runs in the page head); `app/+html.tsx` default export `Root({ children })`.
- The script contract: on `beforeinstallprompt` it calls `event.preventDefault()` and stores the event in `window.__zencInstallPromptEvent`; on `appinstalled` it sets that to `null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/install-capture.test.ts`:

```ts
import vm from "vm";

import { INSTALL_CAPTURE_SCRIPT } from "../../src/features/install/capture-script";

function run() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const window: Record<string, unknown> = { addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => { listeners[type] = listener; } };

  vm.runInNewContext(INSTALL_CAPTURE_SCRIPT, { window });

  return { listeners, window };
}

describe("INSTALL_CAPTURE_SCRIPT", () => {
  it("keeps the beforeinstallprompt event for the app and stops the browser's own mini-infobar", () => {
    const { listeners, window } = run();
    const event = { preventDefault: jest.fn() };

    listeners.beforeinstallprompt(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(window.__zencInstallPromptEvent).toBe(event);
  });

  it("forgets the event once the app is installed", () => {
    const { listeners, window } = run();

    listeners.beforeinstallprompt({ preventDefault: jest.fn() });
    listeners.appinstalled({});

    expect(window.__zencInstallPromptEvent).toBeNull();
  });
});
```

Create `tests/unit/html-head.test.ts` (the `+html` root rendered to a string; Jest's `testMatch` is `**/*.test.ts`, so no JSX in test files, `React.createElement` instead):

```ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Root from "../../app/+html";

describe("app/+html.tsx", () => {
  const html = renderToStaticMarkup(React.createElement(Root, null, React.createElement("div", { id: "app" })));

  it.each([
    '<link href="/manifest.json" rel="manifest"/>',
    '<meta content="#171412" name="theme-color"/>',
    '<meta content="yes" name="apple-mobile-web-app-capable"/>',
    '<meta content="black-translucent" name="apple-mobile-web-app-status-bar-style"/>',
    '<meta content="Zenc" name="apple-mobile-web-app-title"/>',
    '<link href="/icons/apple-touch-icon.png" rel="apple-touch-icon"/>',
  ])("has %s", (tag) => {
    expect(html).toContain(tag);
  });

  it("has a viewport that also covers the notch area", () => {
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("width=device-width");
  });

  it("captures the install prompt before the bundle runs and renders the app body", () => {
    expect(html).toContain("__zencInstallPromptEvent");
    expect(html).toContain('<div id="app"></div>');
  });
});
```

(If `renderToStaticMarkup` orders attributes differently from the strings above, adjust the expected strings to what it prints; the test's job is that each tag exists.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/install-capture.test.ts tests/unit/html-head.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `src/features/install/capture-script.ts`:

```ts
// Inlined in <head> (app/+html.tsx). Chrome fires `beforeinstallprompt` once, often before the React bundle has mounted, so the
// event is parked on `window` for useInstallPrompt to pick up.
export const INSTALL_CAPTURE_SCRIPT = `
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  window.__zencInstallPromptEvent = event;
});
window.addEventListener("appinstalled", function () {
  window.__zencInstallPromptEvent = null;
});
`;
```

Create `app/+html.tsx`:

```tsx
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

import { INSTALL_CAPTURE_SCRIPT } from "../src/features/install/capture-script";

// The static export's document. Replacing Expo's default means repeating what it gave us (charset, viewport, the scroll reset).
// `viewport-fit=cover` lets the page use the whole iPhone screen with `black-translucent`; `Screen` pads by the safe-area insets.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta content="IE=edge" httpEquiv="X-UA-Compatible" />
        <meta content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" name="viewport" />
        <link href="/manifest.json" rel="manifest" />
        <meta content="#171412" name="theme-color" />
        <meta content="yes" name="apple-mobile-web-app-capable" />
        <meta content="black-translucent" name="apple-mobile-web-app-status-bar-style" />
        <meta content="Zenc" name="apple-mobile-web-app-title" />
        <link href="/icons/apple-touch-icon.png" rel="apple-touch-icon" />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest tests/unit/install-capture.test.ts tests/unit/html-head.test.ts tests/unit/route-collisions.test.ts tests/unit/route-parents-coverage.test.ts`
Expected: `install-capture` and `html-head` PASS, but `route-parents-coverage` FAILS with `missing: ["/+html"]`: its file filter treats every `.tsx` under `app/` that is not a `_layout` as a screen, and `+html.tsx` is Expo Router's document, not a screen. Fix the test's filter (line 17 of `tests/unit/route-parents-coverage.test.ts`) so special `+` files are ignored, the same way layouts are:

```ts
  .filter((file) => file.endsWith(".tsx") && !/^(_layout|\+)/.test(file.split("/").pop()!))
```

Run the same four test files again: all PASS (`route-collisions.test.ts` already passes: `+html` has a single owner).

- [ ] **Step 5: Check the real export carries the head**

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key \
  npx expo export --platform web --output-dir /tmp/claude-1000/-home-samuel-projects-barberschedule/pwa-dist
grep -c 'rel="manifest"' /tmp/claude-1000/-home-samuel-projects-barberschedule/pwa-dist/index.html
ls /tmp/claude-1000/-home-samuel-projects-barberschedule/pwa-dist/manifest.json /tmp/claude-1000/-home-samuel-projects-barberschedule/pwa-dist/sw.js /tmp/claude-1000/-home-samuel-projects-barberschedule/pwa-dist/icons
```

Expected: `1`; the manifest, worker and the five icons are in the export root. If the page lost its styles or scrolling, a default head element is missing in `+html.tsx`: compare with `node_modules/expo-router/build/static/html.js`.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add app/+html.tsx src/features/install/capture-script.ts tests/unit/install-capture.test.ts tests/unit/html-head.test.ts tests/unit/route-parents-coverage.test.ts
git commit -m "feat(web): document head with manifest, Apple tags and install-prompt capture"
```

---

### Task 4: Install state and `useInstallPrompt`

**Files:**
- Create: `src/features/install/install-state.ts`, `src/features/install/environment.ts`, `src/features/install/use-install-prompt.ts`
- Test: `tests/unit/install-state.test.ts`, `tests/unit/use-install-prompt.test.ts`

**Interfaces:**
- Produces:
  - `type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }`
  - `type InstallEnvironment = { capturedPrompt: BeforeInstallPromptEvent | null; isWeb: boolean; maxTouchPoints: number; standalone: boolean; userAgent: string }`
  - `type InstallState = { status: "native" } | { status: "installed" } | { promptEvent: BeforeInstallPromptEvent; status: "installable-chrome" } | { browser: "chrome" | "other"; status: "installable-ios" } | { status: "installable-mac-safari" } | { status: "unsupported" }`
  - `resolveInstallState(env: InstallEnvironment): InstallState`; `isIos(env): boolean` (iPhone, iPad, iPod, and iPadOS 13+ which reports as Macintosh with touch points); `readInstallEnvironment(): InstallEnvironment`
  - `useInstallPrompt(): InstallState` (updates on `beforeinstallprompt` and `appinstalled`)
- Part 4 imports `isIos`, `readInstallEnvironment` and `resolveInstallState` from here.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/install-state.test.ts`:

```ts
import { isIos, resolveInstallState } from "../../src/features/install/install-state";
import type { InstallEnvironment } from "../../src/features/install/install-state";

const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";

const env = (patch: Partial<InstallEnvironment>): InstallEnvironment => ({ capturedPrompt: null, isWeb: true, maxTouchPoints: 0, standalone: false, userAgent: FIREFOX, ...patch });
const prompt = { prompt: jest.fn(), userChoice: Promise.resolve({ outcome: "accepted" as const }) } as never;

describe("resolveInstallState", () => {
  it.each([
    ["the native app", env({ isWeb: false }), { status: "native" }],
    ["an installed web app", env({ standalone: true, userAgent: CHROME_ANDROID }), { status: "installed" }],
    ["Chrome with a captured prompt", env({ capturedPrompt: prompt, userAgent: CHROME_ANDROID }), { promptEvent: prompt, status: "installable-chrome" }],
    ["Safari on iPhone", env({ maxTouchPoints: 5, userAgent: SAFARI_IPHONE }), { browser: "other", status: "installable-ios" }],
    ["Chrome on iPhone", env({ maxTouchPoints: 5, userAgent: CHROME_IPHONE }), { browser: "chrome", status: "installable-ios" }],
    ["an iPad in desktop mode", env({ maxTouchPoints: 5, userAgent: SAFARI_MAC }), { browser: "other", status: "installable-ios" }],
    ["Safari on a Mac", env({ userAgent: SAFARI_MAC }), { status: "installable-mac-safari" }],
    ["Chrome on a Mac without a prompt", env({ userAgent: CHROME_MAC }), { status: "unsupported" }],
    ["Firefox", env({}), { status: "unsupported" }],
  ])("%s", (_name, environment, expected) => {
    expect(resolveInstallState(environment)).toEqual(expected);
  });

  it("an installed app wins over a stale captured prompt", () => {
    expect(resolveInstallState(env({ capturedPrompt: prompt, standalone: true }))).toEqual({ status: "installed" });
  });
});

describe("isIos", () => {
  it("is true for iPhone and for an iPad that reports as a Mac with touch", () => {
    expect(isIos(env({ userAgent: SAFARI_IPHONE }))).toBe(true);
    expect(isIos(env({ maxTouchPoints: 5, userAgent: SAFARI_MAC }))).toBe(true);
  });

  it("is false for a real Mac and for Android", () => {
    expect(isIos(env({ userAgent: SAFARI_MAC }))).toBe(false);
    expect(isIos(env({ userAgent: CHROME_ANDROID }))).toBe(false);
  });
});
```

Create `tests/unit/use-install-prompt.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react-native";

jest.mock("../../src/features/install/environment", () => ({ readInstallEnvironment: jest.fn() }));

import { readInstallEnvironment } from "../../src/features/install/environment";
import { useInstallPrompt } from "../../src/features/install/use-install-prompt";

const base = { capturedPrompt: null, isWeb: true, maxTouchPoints: 0, standalone: false, userAgent: "Firefox" };

function fakeWindow() {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};
  const target = {
    addEventListener: jest.fn((type: string, listener: (event: unknown) => void) => { (listeners[type] ??= []).push(listener); }),
    removeEventListener: jest.fn((type: string, listener: (event: unknown) => void) => { listeners[type] = (listeners[type] ?? []).filter((item) => item !== listener); }),
  };

  return { emit: (type: string, event: unknown) => (listeners[type] ?? []).forEach((listener) => listener(event)), listeners, target };
}

describe("useInstallPrompt", () => {
  const originalWindow = globalThis.window;
  afterEach(() => { Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow }); });

  it("starts from the environment", async () => {
    jest.mocked(readInstallEnvironment).mockReturnValue({ ...base, isWeb: false });
    const { result } = await renderHook(() => useInstallPrompt());

    expect(result.current).toEqual({ status: "native" });
  });

  it("switches to the Chrome card when the browser fires beforeinstallprompt, and to installed after appinstalled", async () => {
    const fake = fakeWindow();
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake.target });
    jest.mocked(readInstallEnvironment).mockReturnValue(base);
    const { result } = await renderHook(() => useInstallPrompt());
    const event = { preventDefault: jest.fn(), prompt: jest.fn(), userChoice: Promise.resolve({ outcome: "accepted" }) };

    expect(result.current).toEqual({ status: "unsupported" });
    await act(async () => fake.emit("beforeinstallprompt", event));
    expect(result.current).toEqual({ promptEvent: event, status: "installable-chrome" });
    expect(event.preventDefault).toHaveBeenCalled();

    await act(async () => fake.emit("appinstalled", {}));
    expect(result.current).toEqual({ status: "installed" });
  });

  it("removes its listeners on unmount", async () => {
    const fake = fakeWindow();
    Object.defineProperty(globalThis, "window", { configurable: true, value: fake.target });
    jest.mocked(readInstallEnvironment).mockReturnValue(base);
    const { unmount } = await renderHook(() => useInstallPrompt());

    unmount();

    expect(fake.listeners.beforeinstallprompt).toEqual([]);
    expect(fake.listeners.appinstalled).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx jest tests/unit/install-state.test.ts tests/unit/use-install-prompt.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Create `src/features/install/install-state.ts`:

```ts
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallEnvironment = {
  capturedPrompt: BeforeInstallPromptEvent | null;
  isWeb: boolean;
  maxTouchPoints: number;
  standalone: boolean;
  userAgent: string;
};

export type InstallState =
  | { status: "native" }
  | { status: "installed" }
  | { promptEvent: BeforeInstallPromptEvent; status: "installable-chrome" }
  | { browser: "chrome" | "other"; status: "installable-ios" }
  | { status: "installable-mac-safari" }
  | { status: "unsupported" };

const lower = (env: InstallEnvironment) => env.userAgent.toLowerCase();

// iPadOS 13+ announces itself as "Macintosh" (desktop mode): only multi-touch gives an iPad away.
const isTouchMac = (env: InstallEnvironment) => /macintosh/.test(lower(env)) && env.maxTouchPoints > 1;

// Every browser on iOS/iPadOS runs on Apple's WebKit and has the same "Add to Home Screen" in the system share sheet,
// so Chrome, Firefox and Edge on iPhone need the same guide as Safari.
export const isIos = (env: InstallEnvironment) => /iphone|ipad|ipod/.test(lower(env)) || isTouchMac(env);

// Only Chrome on iOS has a fixed position for the item (the browser's own ⋯ menu); Safari's toolbar layout varies with the user's
// settings, so its guide covers both possibilities in the step text.
const iosBrowser = (env: InstallEnvironment) => (/crios/.test(lower(env)) ? "chrome" : "other");

// Safari on macOS never fires beforeinstallprompt and says "Add to Dock", not "Add to Home Screen".
const isMacSafari = (env: InstallEnvironment) =>
  /macintosh/.test(lower(env)) && !isTouchMac(env) && /safari/.test(lower(env)) && !/chrome|chromium|crios|edg|opr|firefox|fxios/.test(lower(env));

export function resolveInstallState(env: InstallEnvironment): InstallState {
  if (!env.isWeb) return { status: "native" };
  if (env.standalone) return { status: "installed" };
  if (env.capturedPrompt) return { promptEvent: env.capturedPrompt, status: "installable-chrome" };
  if (isIos(env)) return { browser: iosBrowser(env), status: "installable-ios" };
  if (isMacSafari(env)) return { status: "installable-mac-safari" };

  return { status: "unsupported" };
}
```

Create `src/features/install/environment.ts`:

```ts
import { Platform } from "react-native";

import type { BeforeInstallPromptEvent, InstallEnvironment } from "./install-state";

declare global {
  interface Window {
    __zencInstallPromptEvent?: BeforeInstallPromptEvent | null;
  }
}

export function readInstallEnvironment(): InstallEnvironment {
  const isWeb = Platform.OS === "web" && typeof window !== "undefined";
  if (!isWeb) return { capturedPrompt: null, isWeb: false, maxTouchPoints: 0, standalone: false, userAgent: "" };

  const nav = navigator as Navigator & { standalone?: boolean };

  return {
    capturedPrompt: window.__zencInstallPromptEvent ?? null,
    isWeb: true,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || nav.standalone === true,
    userAgent: nav.userAgent ?? "",
  };
}
```

Create `src/features/install/use-install-prompt.ts`:

```ts
import { useEffect, useState } from "react";

import { readInstallEnvironment } from "./environment";
import { resolveInstallState } from "./install-state";
import type { BeforeInstallPromptEvent, InstallState } from "./install-state";

// What the install card should offer right now. Chrome may have fired beforeinstallprompt before this mounted (the head script
// kept it); otherwise the listener below catches it.
export function useInstallPrompt(): InstallState {
  const [state, setState] = useState<InstallState>(() => resolveInstallState(readInstallEnvironment()));

  useEffect(() => {
    const environment = readInstallEnvironment();
    if (!environment.isWeb || environment.standalone) return undefined;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setState({ promptEvent: event as BeforeInstallPromptEvent, status: "installable-chrome" });
    };
    const onInstalled = () => setState({ status: "installed" });

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return state;
}
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest tests/unit/install-state.test.ts tests/unit/use-install-prompt.test.ts`
Expected: PASS. (In the hook test the mocked environment says `isWeb: true`; `window` is the fake object, so the effect attaches the listeners to it.)

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/install tests/unit/install-state.test.ts tests/unit/use-install-prompt.test.ts
git commit -m "feat(install): install state resolution and useInstallPrompt"
```

---

### Task 5: `InstallGuide` and `InstallPrompt` (the card)

**Files:**
- Create: `src/features/install/InstallGuide.tsx`, `src/features/install/InstallPrompt.tsx`
- Modify: `src/i18n/locales/en.ts`, `pt.ts`, `es.ts` (new `install` group)
- Test: `tests/unit/install-prompt.test.ts`

**Interfaces:**
- Consumes: `useInstallPrompt`, `InstallState` (Task 4), `useColors()` from `src/lib/design/theme/ThemeProvider`, `Button` from `src/components/ui/Button`, `Card` from `src/components/ui/Card`.
- Produces:
  - `InstallGuide({ onClose, variant, visible }: { onClose: () => void; variant: "ios-chrome" | "ios-other" | "mac-safari"; visible: boolean })` — centred floating window, X top-right (`testID="install-guide-close"`), backdrop closes (`testID="install-guide-backdrop"`), window `testID="install-guide"`, a "Got it" button.
  - `InstallPrompt()` — returns `null` for `native`/`installed`/`unsupported`; otherwise the card (`testID="install-card"`); Chrome variant has the button `testID="install-button"`; iOS/Mac variants make the whole card a button that opens the guide.
  - i18n: `install.chromeTitle`, `install.chromeBody`, `install.chromeButton`, `install.iosTitle`, `install.iosBody`, `install.macTitle`, `install.macBody`, `install.guideClose`, `install.guideGotIt`, `install.stepMenuChrome`, `install.stepAddHome`, `install.stepShareOrMenu`, `install.stepAddHomeOrShare`, `install.stepMacShare`, `install.stepMacAdd`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/install-prompt.test.ts`:

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

jest.mock("../../src/features/install/use-install-prompt", () => ({ useInstallPrompt: jest.fn() }));

import { InstallGuide } from "../../src/features/install/InstallGuide";
import { InstallPrompt } from "../../src/features/install/InstallPrompt";
import { useInstallPrompt } from "../../src/features/install/use-install-prompt";
import i18n from "../../src/i18n";

const state = (value: unknown) => jest.mocked(useInstallPrompt).mockReturnValue(value as never);

describe("InstallPrompt", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it.each([{ status: "native" }, { status: "installed" }, { status: "unsupported" }])("renders nothing for %j", async (value) => {
    state(value);
    const view = await render(React.createElement(InstallPrompt));

    expect(view.queryByTestId("install-card")).toBeNull();
  });

  it("offers the browser's own prompt on Chrome", async () => {
    const prompt = jest.fn().mockResolvedValue(undefined);
    state({ promptEvent: { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) }, status: "installable-chrome" });
    const view = await render(React.createElement(InstallPrompt));

    expect(view.getByText("Install the app")).toBeTruthy();
    await fireEvent.press(view.getByTestId("install-button"));

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("opens the Chrome-iOS guide with the menu as the first step", async () => {
    state({ browser: "chrome", status: "installable-ios" });
    const view = await render(React.createElement(InstallPrompt));

    expect(view.getByText("Add to Home Screen")).toBeTruthy();
    expect(view.queryByTestId("install-guide")).toBeNull();
    await fireEvent.press(view.getByTestId("install-card"));

    expect(view.getByTestId("install-guide")).toBeTruthy();
    expect(view.getByText("Tap the browser menu (⋯)")).toBeTruthy();
  });

  it("opens the generic iOS guide for Safari and the other browsers", async () => {
    state({ browser: "other", status: "installable-ios" });
    const view = await render(React.createElement(InstallPrompt));

    await fireEvent.press(view.getByTestId("install-card"));

    expect(view.getByText("Tap the Share icon. If you do not see it, tap the browser menu first.")).toBeTruthy();
  });

  it("offers Add to Dock on Safari for Mac", async () => {
    state({ status: "installable-mac-safari" });
    const view = await render(React.createElement(InstallPrompt));

    expect(view.getByText("Add to Dock")).toBeTruthy();
    await fireEvent.press(view.getByTestId("install-card"));
    expect(view.getByText("Choose “Add to Dock”")).toBeTruthy();
  });

  it("closes the guide with the X, with Got it and by tapping outside", async () => {
    state({ browser: "other", status: "installable-ios" });
    const view = await render(React.createElement(InstallPrompt));

    for (const closer of ["install-guide-close", "install-guide-backdrop", "install-guide-done"]) {
      await fireEvent.press(view.getByTestId("install-card"));
      expect(view.getByTestId("install-guide")).toBeTruthy();
      await fireEvent.press(view.getByTestId(closer));
      expect(view.queryByTestId("install-guide")).toBeNull();
    }
  });
});

describe("InstallGuide", () => {
  it("renders nothing while hidden", async () => {
    const view = await render(React.createElement(InstallGuide, { onClose: jest.fn(), variant: "ios-other", visible: false }));

    expect(view.queryByTestId("install-guide")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx jest tests/unit/install-prompt.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Add the texts (all three locales, a new `install` group after `shopGate`)**

`en.ts`:

```ts
  install: {
    chromeBody: "Open Zenc straight from your home screen.",
    chromeButton: "Install",
    chromeTitle: "Install the app",
    guideClose: "Close",
    guideGotIt: "Got it",
    iosBody: "Open Zenc straight from your home screen.",
    iosTitle: "Add to Home Screen",
    macBody: "Open Zenc straight from your Mac's Dock.",
    macTitle: "Add to Dock",
    stepAddHome: "Tap “Add to Home Screen”",
    stepAddHomeOrShare: "Tap “Add to Home Screen” (inside Share, if that is where it is)",
    stepMacAdd: "Choose “Add to Dock”",
    stepMacShare: "Click the Share icon in the address bar",
    stepMenuChrome: "Tap the browser menu (⋯)",
    stepShareOrMenu: "Tap the Share icon. If you do not see it, tap the browser menu first.",
  },
```

`pt.ts`:

```ts
  install: {
    chromeBody: "Abra o Zenc direto da tela inicial do seu celular.",
    chromeButton: "Instalar",
    chromeTitle: "Instalar o app",
    guideClose: "Fechar",
    guideGotIt: "Entendi",
    iosBody: "Abra o Zenc direto da tela inicial do seu celular.",
    iosTitle: "Adicionar à Tela de Início",
    macBody: "Abra o Zenc direto do Dock do seu Mac.",
    macTitle: "Adicionar ao Dock",
    stepAddHome: "Toque em “Adicionar à Tela de Início”",
    stepAddHomeOrShare: "Toque em “Adicionar à Tela de Início” (dentro de Compartilhar, se for o caso)",
    stepMacAdd: "Escolha “Adicionar ao Dock”",
    stepMacShare: "Clique no ícone de Compartilhar na barra de endereço",
    stepMenuChrome: "Toque no menu (⋯) do navegador",
    stepShareOrMenu: "Toque no ícone de Compartilhar. Se ele não aparecer, toque primeiro no menu do navegador.",
  },
```

`es.ts`:

```ts
  install: {
    chromeBody: "Abre Zenc directamente desde la pantalla de inicio.",
    chromeButton: "Instalar",
    chromeTitle: "Instalar la app",
    guideClose: "Cerrar",
    guideGotIt: "Entendido",
    iosBody: "Abre Zenc directamente desde la pantalla de inicio.",
    iosTitle: "Añadir a la pantalla de inicio",
    macBody: "Abre Zenc directamente desde el Dock de tu Mac.",
    macTitle: "Añadir al Dock",
    stepAddHome: "Toca “Añadir a pantalla de inicio”",
    stepAddHomeOrShare: "Toca “Añadir a pantalla de inicio” (dentro de Compartir, si es el caso)",
    stepMacAdd: "Elige “Añadir al Dock”",
    stepMacShare: "Haz clic en el icono de Compartir de la barra de direcciones",
    stepMenuChrome: "Toca el menú (⋯) del navegador",
    stepShareOrMenu: "Toca el icono de Compartir. Si no aparece, toca primero el menú del navegador.",
  },
```

(`en` is the typed source of truth; tsc and `locale-parity` then force the other two to match.)

- [ ] **Step 4: Implement the components**

Create `src/features/install/InstallGuide.tsx` (modelled on `AppointmentSheet`: centred card, X top-right, tap outside closes):

```tsx
import { Ellipsis, Share, SquarePlus, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";

export type InstallGuideVariant = "ios-chrome" | "ios-other" | "mac-safari";

export function InstallGuide({ onClose, variant, visible }: { onClose: () => void; variant: InstallGuideVariant; visible: boolean }) {
  const colors = useColors();
  const { t } = useTranslation();

  if (!visible) return null;

  const icon = (Icon: typeof Share) => <Icon color={colors.primary[600]} size={18} />;
  const steps: Array<{ icon: ReactNode; text: string }> =
    variant === "mac-safari"
      ? [{ icon: icon(Share), text: t("install.stepMacShare") }, { icon: icon(SquarePlus), text: t("install.stepMacAdd") }]
      : variant === "ios-chrome"
        ? [{ icon: icon(Ellipsis), text: t("install.stepMenuChrome") }, { icon: icon(SquarePlus), text: t("install.stepAddHome") }]
        : [
            { icon: <View className="flex-row gap-1">{icon(Share)}{icon(Ellipsis)}</View>, text: t("install.stepShareOrMenu") },
            { icon: icon(SquarePlus), text: t("install.stepAddHomeOrShare") },
          ];
  const title = variant === "mac-safari" ? t("install.macTitle") : t("install.iosTitle");

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID="install-guide-backdrop">
        <Pressable className="w-full max-w-[420px] gap-4 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="install-guide">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("install.guideClose")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="install-guide-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View className="gap-3">
            {steps.map((step, index) => (
              <View className="flex-row items-center gap-3" key={index}>
                <View className="h-6 w-6 items-center justify-center rounded-full bg-primary-100">
                  <Text className="text-xs font-sans-bold text-primary-600" style={{ fontVariant: ["tabular-nums"] }}>{index + 1}</Text>
                </View>
                {step.icon}
                <Text className="flex-1 text-sm font-sans-medium text-neutral-700">{step.text}</Text>
              </View>
            ))}
          </View>
          <Button label={t("install.guideGotIt")} onPress={onClose} testID="install-guide-done" variant="outline" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

Create `src/features/install/InstallPrompt.tsx`:

```tsx
import { SquarePlus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { InstallGuide } from "./InstallGuide";
import { useInstallPrompt } from "./use-install-prompt";

const CARD = "min-h-[56px] flex-row items-center justify-between gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4";

// "Add Zenc to your home screen", on the profile hub only (never as an automatic pop-up). One card per situation: Chrome gets
// the browser's own prompt, iPhone/iPad and Safari on Mac get a short guide, everything else shows nothing.
export function InstallPrompt() {
  const colors = useColors();
  const { t } = useTranslation();
  const install = useInstallPrompt();
  const [guideOpen, setGuideOpen] = useState(false);

  if (install.status === "native" || install.status === "installed" || install.status === "unsupported") return null;

  if (install.status === "installable-chrome") {
    const { promptEvent } = install;

    return (
      <View className={CARD} testID="install-card">
        <View className="flex-1 gap-1">
          <Text className="text-base font-sans-semibold text-ink">{t("install.chromeTitle")}</Text>
          <Text className="text-sm font-sans text-neutral-600">{t("install.chromeBody")}</Text>
        </View>
        <Button
          label={t("install.chromeButton")}
          onPress={() => void promptEvent.prompt().then(() => promptEvent.userChoice).catch(() => undefined)}
          size="sm"
          testID="install-button"
        />
      </View>
    );
  }

  const mac = install.status === "installable-mac-safari";
  const variant = mac ? "mac-safari" : install.browser === "chrome" ? "ios-chrome" : "ios-other";
  const title = mac ? t("install.macTitle") : t("install.iosTitle");

  return (
    <>
      <Pressable accessibilityLabel={title} accessibilityRole="button" className={CARD} onPress={() => setGuideOpen(true)} testID="install-card">
        <View className="flex-1 gap-1">
          <Text className="text-base font-sans-semibold text-ink">{title}</Text>
          <Text className="text-sm font-sans text-neutral-600">{mac ? t("install.macBody") : t("install.iosBody")}</Text>
        </View>
        <SquarePlus color={colors.neutral[400]} size={20} />
      </Pressable>
      <InstallGuide onClose={() => setGuideOpen(false)} variant={variant} visible={guideOpen} />
    </>
  );
}
```

The Chrome card uses the label-only `Button` (the project's `Button` has no icon slot).

- [ ] **Step 5: Run and see it pass**

Run: `npx jest tests/unit/install-prompt.test.ts tests/unit/locale-parity.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts
git add src/features/install src/i18n/locales tests/unit/install-prompt.test.ts
git commit -m "feat(install): install card and add-to-home-screen guide"
```

---

### Task 6: Mount the card on the three profile hubs and check it in a browser

**Files:**
- Modify: `app/(customer)/(tabs)/profile.tsx`, `app/(professional)/my-profile/index.tsx`, `app/(owner)/settings.tsx`
- Modify: `playwright.config.ts`, `playwright.chrome.config.ts` (`serviceWorkers: "block"`)
- Create: `tests/e2e/pwa.web.spec.ts`, `tests/e2e/install-helpers.ts`
- Modify: `tests/e2e/profile.web.spec.ts`, `professional-profile.web.spec.ts`, `owner-profile.web.spec.ts` (one test each)

**Interfaces:**
- Consumes: `InstallPrompt` (Task 5).

- [ ] **Step 1: Write the failing e2e checks**

Create `tests/e2e/install-helpers.ts`:

```ts
import type { Page } from "@playwright/test";

// A Chrome-like install prompt that was captured before the bundle mounted (what the head script leaves on `window`).
export async function stubInstallPrompt(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__zencInstallPromptEvent = {
      preventDefault() {},
      prompt: async () => { (window as unknown as Record<string, unknown>).__installPrompted = true; },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    };
  });
}
```

In `playwright.config.ts` and `playwright.chrome.config.ts` add `serviceWorkers: "block"` inside `use`.

In each of the three existing profile specs add a test (the sign-in and mock calls are the ones that spec's first test already uses):

`tests/e2e/profile.web.spec.ts` (import `stubInstallPrompt` from `./install-helpers`):

```ts
test("the profile hub offers to install the app and calls the browser prompt", async ({ page }) => {
  await stubInstallPrompt(page);
  await signInAsCustomer(page);
  await mockCustomerRest(page);

  await page.goto("/profile");
  await expect(page.getByText("Install the app")).toBeVisible();
  await page.getByTestId("install-button").click();

  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__installPrompted)).toBe(true);
});
```

`tests/e2e/professional-profile.web.spec.ts`:

```ts
test("the professional hub shows the install card", async ({ page }) => {
  await stubInstallPrompt(page);
  await signIn(page, professionalUserId);
  await mockProfessionalRest(page);

  await page.goto("/my-profile");
  await expect(page.getByTestId("install-card")).toBeVisible();
});
```

`tests/e2e/owner-profile.web.spec.ts`:

```ts
test("the owner account hub shows the install card", async ({ page }) => {
  await stubInstallPrompt(page);
  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, linked: false });

  await page.goto("/settings");
  await expect(page.getByTestId("install-card")).toBeVisible();
});
```

Create `tests/e2e/pwa.web.spec.ts`:

```ts
import { expect, test } from "./fixtures";

test.use({ serviceWorkers: "allow" });

test("the export serves the manifest, the icons and a service worker that registers", async ({ page }) => {
  await page.route("**/rest/v1/**", (route) => route.fulfill({ body: "[]", contentType: "application/json" }));
  const manifest = await page.request.get("/manifest.json");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe("Zenc");
  for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
    expect((await page.request.get(`/icons/${icon}`)).ok(), icon).toBe(true);
  }

  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.json");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Zenc");
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active));
});
```

- [ ] **Step 2: Run them and watch them fail**

Run (procedure in part 1 Task 14, then): `npm run e2e:export && (npm run e2e:serve &) && sleep 3 && npx playwright test -c playwright.chrome.config.ts tests/e2e/pwa.web.spec.ts tests/e2e/profile.web.spec.ts -g "install|manifest"`
Expected: FAIL (`install-card` not found; the PWA spec passes only if Tasks 1 to 3 are in the export, which they are, so only the card tests fail).

- [ ] **Step 3: Mount the card**

In each hub import `import { InstallPrompt } from "<relative path>/src/features/install/InstallPrompt";` and place `<InstallPrompt />` directly above the sign-out `Pressable`:
- `app/(customer)/(tabs)/profile.tsx`: after the last `MenuBlock`, before `<Pressable ... testID="profile-signout">`-style sign-out block (line ~63).
- `app/(professional)/my-profile/index.tsx`: after the third `MenuBlock`, before the sign-out block (line ~70).
- `app/(owner)/settings.tsx`: after the `privacy/settings/about` `MenuBlock`, before the sign-out `Pressable` (line ~76).

The hubs' parent `View` uses `gap-6`; `InstallPrompt` renders nothing (not even an empty `View`) when it has no card, so no blank gap appears in browsers without one.

- [ ] **Step 4: Run and see them pass**

Run: `npm run e2e:export && npx playwright test -c playwright.chrome.config.ts tests/e2e/pwa.web.spec.ts tests/e2e/profile.web.spec.ts tests/e2e/professional-profile.web.spec.ts tests/e2e/owner-profile.web.spec.ts`
Expected: PASS. Then the whole suite once (`npx playwright test -c playwright.chrome.config.ts`) to confirm `serviceWorkers: "block"` and the new head did not disturb any of the 50 specs.

- [ ] **Step 5: Look at it (project rule: verify UI in a browser)**

With the export served (`npm run e2e:serve`), open `http://shop-a.localhost:4173/profile` after a sign-in (reuse `signInAsCustomer`'s session via `javascript_tool`, or run a Playwright script with `page.screenshot`): take screenshots of the Chrome card (stub the event with `stubInstallPrompt`) and of the iOS card plus its open guide (set the user agent to an iPhone string with `browser.newContext({ userAgent })`). Check with `getComputedStyle` that the card has the 20 px radius, a 1 px neutral-200 border, and the `Install` button the accent fill with the on-accent label colour; the guide window is centred with the X top-right; tapping outside closes it. Attach nothing to the commit; record what was checked in the PR description.

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit && ./node_modules/.bin/eslint app src tests scripts && npx jest 2>&1 | tail -6
git add "app/(customer)/(tabs)/profile.tsx" "app/(professional)/my-profile/index.tsx" "app/(owner)/settings.tsx" playwright.config.ts tests/e2e
git commit -m "feat(install): install card on the customer, professional and owner profile hubs"
```

(`playwright.chrome.config.ts` is a local, uncommitted config; do not add it.)

---

### Task 7: Final verification and the real-device handover

- [ ] **Step 1: Run every check**

```bash
npx tsc --noEmit
./node_modules/.bin/eslint app src tests scripts
npm run lint
npx jest 2>&1 | tail -8
npm run test:e2e:runner
```

Expected: 0 type errors, both lints clean, Jest green (the known "worker process has failed to exit gracefully" warning from `tests/integration/app-providers.test.ts` is pre-existing), node tests green. No SQL changed, so pgTAP is not required, but `npx supabase db reset && npx supabase test db` must still pass on the stacked branch. Run the full Playwright suite once.

- [ ] **Step 2: Lighthouse-style installability check in Chrome**

Export and serve (`npm run e2e:export && npm run e2e:serve`), open `http://shop-a.localhost:4173/login` in Chrome, DevTools, Application tab: **Manifest** shows no errors and the four icons; **Service Workers** shows `sw.js` activated; the address bar offers the install icon. Write the result in the PR description.

- [ ] **Step 3: Handover for the user (cannot be automated)**

List in the PR description what the user checks once hosted, from the spec: Android Chrome shows the card and installs with the Zenc icon and name; iPhone Safari and iPhone Chrome show "Add to Home Screen", the guide matches their menus, and the installed app opens standalone with the status bar clear of the page (this verifies `viewport-fit=cover` plus the safe-area padding); Safari on Mac shows "Add to Dock". Two subdomains give two "Zenc" icons (accepted in the spec).

- [ ] **Step 4: Update the spec status and commit**

Set `Status:` of `docs/superpowers/specs/2026-11-18-installable-web-app-design.md` to `implemented on feat-installable-web`.

```bash
git add docs
git commit -m "docs: installable web app implemented"
```

---

## Execution deviations

- **Task 3 (`app/+html.tsx`, important):** the plan's document omitted Expo Router's server-document nodes. In SDK 58 a custom `+html` must render `useServerDocumentContext()`'s `headNodes` (styles, preloads), `bodyNodes` (**the bundle `<script>`**), `htmlAttributes` and `bodyAttributes`; without them the static export has the manifest tags but **no JavaScript** (the page stays blank). Found when the whole Playwright suite hung on a spinner-less blank page after the first `+html`; fixed in `app/+html.tsx` and pinned by `tests/unit/html-document-nodes.test.ts` (mocks the context, asserts head nodes in `<head>` and body nodes after the app) and by the PWA e2e (the service worker only registers if the bundle ran).
- **Task 3:** `tests/unit/react-dom-server.d.ts` (a one-function type shim, no new dependency) because `react-dom` ships no types here; `route-parents-coverage.test.ts` ignores `+`-prefixed files as planned.
- **Task 4:** `useInstallPrompt` removes its listeners from the `window` captured when it subscribed (the plan's `window.removeEventListener` in the cleanup failed when `window` had been replaced); the unmount test wraps `unmount()` in `act`.
- **Task 5:** the guide's step icons sit in a fixed-width box (`w-12`) so both steps' texts line up (seen in the screenshot). Tests were extracted together with the code, so the red run for this task and for the Task 6 e2e additions was not shown separately.
- **Task 1:** icons generated with Pillow (already on the machine) from `assets/icon.png`; the maskable ones are the artwork at 80% on the ink background (checked by eye).
- **Browser check (screenshots in the session scratchpad `shots3/`):** against a static export served locally: `/manifest.json` (200, `application/json`, name "Zenc", standalone, 4 icons), `/sw.js` (200, `text/javascript`), the icons (200, `image/png`); the three hubs at 430×900 show the install card; a synthetic `beforeinstallprompt` is stored in `window.__zencInstallPromptEvent` by the head script, the card reacts and **Install** calls the event's `prompt()`; with an iPhone user agent the hub shows "Add to Home Screen" and the guide opens as a centred floating window (X top-right, closes with X, "Got it" and a tap outside). Note: a screenshot taken during the Modal's fade-in looks translucent; wait ~700 ms.
- **Code review fixes (subagent, no Critical):** the Chrome Install card disappears once the browser prompt was used (it can be shown once per event; a dismissed prompt used to leave a dead button), `useInstallPrompt` picks up an event stored between the first render and the effect (tests for both), `manifest.json` gets `"id": "/"`, `+html` adds `mobile-web-app-capable`. **Not changed, follow-ups:** `<html lang>` is fixed to `pt-BR` while the app switches language at runtime (set `document.documentElement.lang` in `syncLanguage` later); the empty `fetch` handler in `sw.js` has a small cold-start cost (revisit when part 4 lands); "Add to Dock" is offered to every Safari on Mac (only Safari 17+ has it); hosting must serve `/sw.js` and `/manifest.json` from the root without long-lived caching and without rewriting `/sw.js` to `index.html`; the `viewport-fit=cover` safe-area behaviour of tab bars and headers on a notched iPhone still needs the user's phone check.
