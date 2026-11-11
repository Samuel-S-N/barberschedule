# Tema por loja Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada estabelecimento escolhe 3 cores (principal, destaque, base) que repintam o app em tempo de execução; o padrão Zenc não muda.

**Architecture:** Os tokens de cor do Tailwind passam a ler variáveis CSS (`rgb(var(--c-…) / <alpha-value>)`). Uma função pura deriva todas as escalas a partir de até 3 hex, garantindo contraste por construção. Um `AppThemeProvider` aplica as variáveis (documento inteiro na web, `vars()` do NativeWind no nativo) e expõe `useColors()` para o JS. A loja guarda as cores em colunas de `shops`; o dono edita numa tela Aparência.

**Tech Stack:** Expo / React Native 0.88, NativeWind 4.2.7 + Tailwind 3, TypeScript, Jest (jest-expo), Playwright, Supabase (Postgres + pgTAP).

**Spec:** `docs/superpowers/specs/2026-11-11-shop-theme-design.md`

## Global Constraints

- 3 cores, todas opcionais: nulo = padrão Zenc; destaque nulo = usa a principal. Destaque (`accent`) pinta só botões de ação preenchidos (`Button` primário e `FabAdd`); principal = identidade; base = tom claro das superfícies e do texto. **Sem modo escuro.**
- Fixos para todas as lojas: `danger`, `success`, `warning`, `white`, gráficos categóricos, barra de status, splash e ícone. `wine` e `ink-soft` (0 usos) saem.
- O padrão Zenc fica **exatamente** como hoje (`DEFAULT_COLORS` e o `global.css`); a derivação só roda para cores personalizadas.
- Sem dependência nova: conversão sRGB ↔ OKLCH escrita à mão.
- Contratos de contraste para temas personalizados: `on-primary`/`on-accent` sobre o preenchimento ≥ 4.5; `primary-600` sobre `canvas` ≥ 4.5; `neutral-500…900` e `ink` sobre `canvas` e `surface` ≥ 4.5; `neutral-400` sobre `canvas` ≥ 98% da razão do padrão (2.89).
- Cores ficam por token/`className`; hex literal só em dados de amostra de cor (a grade de amostras) e no padrão (`colors.ts`).
- Ambiente: `npx eslint app src tests scripts` (o `npm run lint` na raiz falha); e2e com Chrome do sistema (`playwright.chrome.config.ts`), `.env.local` fora do lugar durante o e2e e devolvido depois (use um script com `trap`, nunca `pkill -f`).
- Textos de interface em pt/es/en; `ThemeScope`/provider sem texto.

## Ajustes ao spec (decididos ao escrever este plano)

Aplicados ao spec na Task 1 deste plano, para os dois documentos coincidirem:
1. Os padrões vivem em `src/lib/design/colors.ts` (`DEFAULT_COLORS`, `colorsToVars`), sem imports, para o Node carregá-los direto e gerar o CSS; não existe `theme/defaults.ts`.
2. **No nativo o provider sempre aplica `vars()`, inclusive o padrão**, para não depender de `:root` do CSS no nativo. Na web, com tudo nulo, não escreve nada (o CSS estático já vale).
3. Valores iguais ao padrão (`#DB9A34` na principal/destaque, `#F7F3EE` na base) são tratados como nulos, preservando o padrão exato quando o dono escolhe a amostra padrão.
4. Limite de luminosidade do preenchimento: **L ∈ [0.15, 0.88]**; o degrau 900 usa `min(L900,padrão, A − 0.12)`.
5. Piso de `neutral-400`: 98% da razão do padrão sobre `canvas`.
6. Cache do tema por **usuário** (`zenc.shop-theme.<userId>`), pois a loja só é conhecida depois da consulta. `useCurrentShopId` é dobrado em `useShopTheme()` (uma consulta devolve `shopId` e as 3 cores).
7. Nomes das amostras não são exibidos; a grade mostra as cores (rótulo de acessibilidade = hex).

---

# PARTE A — PR A: tokens, derivação e provider (branch `feat-theme-tokens`)

Sem mudança visível com o padrão. Branch já criada a partir de `main` (o spec está no primeiro commit).

### Task 1: `DEFAULT_COLORS`, `colorsToVars` e ajustes ao spec

**Files:**
- Modify: `src/lib/design/colors.ts`
- Modify: `tests/unit/colors.test.ts`
- Modify: `docs/superpowers/specs/2026-11-11-shop-theme-design.md` (seção "Ajustes")

**Interfaces:**
- Produces (em `src/lib/design/colors.ts`, sem imports):
  - `STEPS: readonly [50,100,200,300,400,500,600,700,800,900]`, `type Step`
  - `type Colors = { primary: Record<Step,string>; accent: string; onAccent: string; onPrimary: string; ink: string; canvas: string; surface: string; mist: string; neutral: Record<Step,string>; danger: {50:string;500:string;600:string}; success: {500:string}; warning: {400:string;500:string}; white: string }`
  - `DEFAULT_COLORS: Colors`
  - `colorsToVars(colors: Colors): Record<string, string>` → chaves `--c-primary-50…900`, `--c-neutral-50…900`, `--c-accent`, `--c-on-accent`, `--c-on-primary`, `--c-ink`, `--c-canvas`, `--c-surface`, `--c-mist`; valores `"R G B"`.
  - `export const colors = DEFAULT_COLORS;` (**temporário**, removido na Task 8)

- [ ] **Step 1: Escrever o teste que falha**

Substituir `tests/unit/colors.test.ts` por:

```ts
import { DEFAULT_COLORS, colorsToVars } from "../../src/lib/design/colors";

describe("design colors", () => {
  it("keeps the primary amber scale", () => {
    expect(DEFAULT_COLORS.primary[400]).toBe("#DB9A34");
    expect(DEFAULT_COLORS.primary[600]).toBe("#9C6819");
  });

  it("keeps the charcoal/surface anchors", () => {
    expect(DEFAULT_COLORS.ink).toBe("#171412");
    expect(DEFAULT_COLORS.canvas).toBe("#F7F3EE");
    expect(DEFAULT_COLORS.surface).toBe("#FFFDFA");
    expect(DEFAULT_COLORS.mist).toBe("#ECE6DE");
  });

  it("uses the amber as the default action colour with the charcoal label on it", () => {
    expect(DEFAULT_COLORS.accent).toBe("#DB9A34");
    expect(DEFAULT_COLORS.onAccent).toBe("#171412");
    expect(DEFAULT_COLORS.onPrimary).toBe("#171412");
  });

  it("keeps neutral, feedback, and white tokens", () => {
    expect(DEFAULT_COLORS.neutral[300]).toBe("#CBBFAF");
    expect(DEFAULT_COLORS.danger[500]).toBe("#DC3B30");
    expect(DEFAULT_COLORS.success[500]).toBe("#2F9E5B");
    expect(DEFAULT_COLORS.warning[400]).toBe("#E8A93B");
    expect(DEFAULT_COLORS.warning[500]).toBe("#C98A1F");
    expect(DEFAULT_COLORS.white).toBe("#FFFFFF");
  });

  it("does not carry the unused wine and ink-soft tokens any more", () => {
    expect(DEFAULT_COLORS).not.toHaveProperty("wine");
    expect(DEFAULT_COLORS).not.toHaveProperty("inkSoft");
  });

  it("turns the themeable tokens into space-separated RGB variables", () => {
    const vars = colorsToVars(DEFAULT_COLORS);

    expect(vars["--c-primary-400"]).toBe("219 154 52");
    expect(vars["--c-accent"]).toBe("219 154 52");
    expect(vars["--c-on-accent"]).toBe("23 20 18");
    expect(vars["--c-canvas"]).toBe("247 243 238");
    expect(vars["--c-neutral-900"]).toBe("23 20 18");
    expect(Object.keys(vars)).toHaveLength(27);
    expect(vars).not.toHaveProperty("--c-danger-500");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/colors.test.ts`
Expected: FAIL (`DEFAULT_COLORS` / `colorsToVars` não exportados).

- [ ] **Step 3: Implementar**

Substituir `src/lib/design/colors.ts` por (sem imports: o Node precisa carregá-lo direto):

```ts
// Default Zenc palette. Themeable tokens are mirrored as CSS variables (see colorsToVars and global.css);
// danger/success/warning/white never change per shop.
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Step = (typeof STEPS)[number];

export type Colors = {
  primary: Record<Step, string>;
  accent: string;
  onAccent: string;
  onPrimary: string;
  ink: string;
  canvas: string;
  surface: string;
  mist: string;
  neutral: Record<Step, string>;
  danger: { 50: string; 500: string; 600: string };
  success: { 500: string };
  warning: { 400: string; 500: string };
  white: string;
};

export const DEFAULT_COLORS: Colors = {
  primary: {
    50: "#FDF6EC", 100: "#FAE8CC", 200: "#F3CE8F", 300: "#EAB157",
    400: "#DB9A34", 500: "#BD8020", 600: "#9C6819", 700: "#784F14",
    800: "#56380E", 900: "#392509",
  },
  accent: "#DB9A34",
  onAccent: "#171412",
  onPrimary: "#171412",
  ink: "#171412",
  canvas: "#F7F3EE",
  surface: "#FFFDFA",
  mist: "#ECE6DE",
  neutral: {
    50: "#FAF8F5", 100: "#F2EEE8", 200: "#E4DDD3", 300: "#CBBFAF",
    400: "#9C8E7B", 500: "#736555", 600: "#564A3D", 700: "#3D3327",
    800: "#2A231A", 900: "#171412",
  },
  danger: { 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" },
  success: { 500: "#2F9E5B" },
  warning: { 400: "#E8A93B", 500: "#C98A1F" },
  white: "#FFFFFF",
};

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

// "R G B" triplets so Tailwind can write rgb(var(--c-x) / <alpha-value>).
export function colorsToVars(colors: Colors): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const step of STEPS) {
    vars[`--c-primary-${step}`] = channels(colors.primary[step]);
  }
  vars["--c-accent"] = channels(colors.accent);
  vars["--c-on-accent"] = channels(colors.onAccent);
  vars["--c-on-primary"] = channels(colors.onPrimary);
  vars["--c-ink"] = channels(colors.ink);
  vars["--c-canvas"] = channels(colors.canvas);
  vars["--c-surface"] = channels(colors.surface);
  vars["--c-mist"] = channels(colors.mist);
  for (const step of STEPS) {
    vars[`--c-neutral-${step}`] = channels(colors.neutral[step]);
  }
  return vars;
}

// Temporary alias while screens move to useColors(); removed once none import it.
export const colors = DEFAULT_COLORS;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/colors.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo (a Task 1 só remove `wine`/`inkSoft`, que ninguém usa).

- [ ] **Step 5: Aplicar os "Ajustes ao spec" no spec**

No spec, trocar o parágrafo do `global.css`/provider/derivação conforme os 7 ajustes acima (padrões em `colors.ts`; nativo sempre aplica `vars()`; valores iguais ao padrão = nulos; L ∈ [0.15, 0.88] e `min(L900, A − 0.12)`; piso de `neutral-400` = 98% de 2.89; cache por usuário; `useShopTheme()` único). Acrescentar no topo da seção "Derivação" a linha: "Ajustes de 2026-11-11: ver plano `2026-11-11-shop-theme.md`, seção 'Ajustes ao spec'." e ajustar os números nos pontos afetados.

- [ ] **Step 6: Commit**

```bash
git add src/lib/design/colors.ts tests/unit/colors.test.ts docs/superpowers/specs/2026-11-11-shop-theme-design.md docs/superpowers/plans/2026-11-11-shop-theme.md
git commit -m "feat(theme): DEFAULT_COLORS and colorsToVars, drop unused wine/ink-soft; plan and spec adjustments"
```

---

### Task 2: Conversão de cor e contraste (`oklch.ts`)

**Files:**
- Create: `src/lib/design/theme/oklch.ts`
- Test: `tests/unit/theme-oklch.test.ts`

**Interfaces:**
- Produces:
  - `type Triplet = [number, number, number]`
  - `hexToRgb(hex: string): Triplet` (0–255), `rgbToHex(rgb: Triplet): string` (`#RRGGBB` maiúsculo, arredonda e limita)
  - `rgbToOklch(rgb: Triplet): [number, number, number]` → `[L, C, h°]`
  - `oklchToRgb(L: number, C: number, h: number): { rgb: Triplet; chroma: number }` (reduz a intensidade até caber no sRGB; `rgb` em float 0–255)
  - `contrast(a: string, b: string): number` (razão WCAG entre dois hex)

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/theme-oklch.test.ts`:

```ts
import { DEFAULT_COLORS, STEPS } from "../../src/lib/design/colors";
import { contrast, hexToRgb, oklchToRgb, rgbToHex, rgbToOklch } from "../../src/lib/design/theme/oklch";

describe("oklch conversion", () => {
  it("matches reference OKLCH values for the default amber", () => {
    const [L, C, h] = rgbToOklch(hexToRgb("#DB9A34"));

    expect(L).toBeCloseTo(0.733, 2);
    expect(C).toBeCloseTo(0.137, 2);
    expect(h).toBeCloseTo(74.09, 0);
  });

  it("maps white and black to the lightness extremes", () => {
    expect(rgbToOklch([255, 255, 255])[0]).toBeCloseTo(1, 3);
    expect(rgbToOklch([0, 0, 0])[0]).toBeCloseTo(0, 3);
  });

  it("round-trips every default primary and neutral colour exactly", () => {
    for (const step of STEPS) {
      for (const hex of [DEFAULT_COLORS.primary[step], DEFAULT_COLORS.neutral[step]]) {
        const [L, C, h] = rgbToOklch(hexToRgb(hex));

        expect(rgbToHex(oklchToRgb(L, C, h).rgb)).toBe(hex);
      }
    }
  });

  it("reduces chroma until the colour fits sRGB", () => {
    const { chroma, rgb } = oklchToRgb(0.9, 0.4, 250);

    expect(chroma).toBeLessThan(0.4);
    for (const channel of rgb) {
      expect(channel).toBeGreaterThanOrEqual(-0.5);
      expect(channel).toBeLessThanOrEqual(255.5);
    }
  });
});

describe("contrast", () => {
  it("is 21 between black and white and symmetric", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
  });

  it("reproduces the ratios measured on the default palette", () => {
    expect(contrast("#171412", "#DB9A34")).toBeCloseTo(7.58, 1);
    expect(contrast("#9C6819", "#F7F3EE")).toBeCloseTo(4.31, 1);
    expect(contrast("#9C8E7B", "#F7F3EE")).toBeCloseTo(2.89, 1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/theme-oklch.test.ts`
Expected: FAIL (`Cannot find module .../theme/oklch`).

- [ ] **Step 3: Implementar**

`src/lib/design/theme/oklch.ts`:

```ts
export type Triplet = [number, number, number];

export function hexToRgb(hex: string): Triplet {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Triplet;
}

export function rgbToHex(rgb: Triplet): string {
  const part = (channel: number) => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");

  return `#${rgb.map(part).join("").toUpperCase()}`;
}

const toLinear = (channel: number) => {
  const value = channel / 255;

  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number) => 255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055);

export function rgbToOklch(rgb: Triplet): [number, number, number] {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return [lightness, Math.hypot(a, bb), ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360];
}

function oklchToLinear(L: number, C: number, h: number): Triplet {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const fitsSrgb = (linear: Triplet) => linear.every((value) => value >= -1e-6 && value <= 1 + 1e-6);

// Reduces chroma (bisection) until the colour is inside the sRGB gamut; lightness and hue are kept.
export function oklchToRgb(L: number, C: number, h: number): { rgb: Triplet; chroma: number } {
  let chroma = C;

  if (!fitsSrgb(oklchToLinear(L, C, h))) {
    let low = 0;
    let high = C;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (fitsSrgb(oklchToLinear(L, mid, h))) low = mid;
      else high = mid;
    }
    chroma = low;
  }

  return { chroma, rgb: oklchToLinear(L, chroma, h).map(fromLinear) as Triplet };
}

const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map(toLinear);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/theme-oklch.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/theme/oklch.ts tests/unit/theme-oklch.test.ts
git commit -m "feat(theme): OKLCH conversion with gamut reduction and WCAG contrast"
```

---

### Task 3: Derivação do tema (`derive.ts`)

**Files:**
- Create: `src/lib/design/theme/derive.ts`
- Test: `tests/unit/theme-derive.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_COLORS`, `STEPS`, `Step`, `Colors`, `colorsToVars` (Task 1); `contrast`, `hexToRgb`, `oklchToRgb`, `rgbToHex`, `rgbToOklch` (Task 2).
- Produces:
  - `type ThemeInput = { primary?: string | null; accent?: string | null; base?: string | null }`
  - `type Theme = { vars: Record<string, string>; colors: Colors; adjusted: { primary: boolean; accent: boolean } }`
  - `DEFAULT_THEME: Theme`
  - `MUTED_MIN_CONTRAST: number`
  - `deriveTheme(input?: ThemeInput): Theme`

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/theme-derive.test.ts`:

```ts
import { DEFAULT_COLORS, STEPS } from "../../src/lib/design/colors";
import { DEFAULT_THEME, MUTED_MIN_CONTRAST, deriveTheme } from "../../src/lib/design/theme/derive";
import { contrast, hexToRgb, rgbToOklch } from "../../src/lib/design/theme/oklch";

// Deterministic PRNG so a failing colour can be reproduced.
function mulberry32(seed: number) {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randomHex = (random: () => number) =>
  `#${[0, 1, 2].map(() => Math.floor(random() * 256).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const EXTREMES = ["#FFFF00", "#000080", "#808080", "#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#7A1F2B", "#171412"];

function expectContracts(input: { primary: string; accent: string; base: string }) {
  const { colors } = deriveTheme(input);
  const label = JSON.stringify(input);

  expect({ label, ratio: contrast(colors.onPrimary, colors.primary[400]) >= 4.5 }).toEqual({ label, ratio: true });
  expect({ label, ratio: contrast(colors.onAccent, colors.accent) >= 4.5 }).toEqual({ label, ratio: true });
  expect({ label, ratio: contrast(colors.primary[600], colors.canvas) >= 4.5 }).toEqual({ label, ratio: true });
  for (const step of [500, 600, 700, 800, 900] as const) {
    for (const surface of [colors.canvas, colors.surface]) {
      expect({ label, step, ratio: contrast(colors.neutral[step], surface) >= 4.5 }).toEqual({ label, step, ratio: true });
    }
  }
  expect({ label, ratio: contrast(colors.ink, colors.canvas) >= 4.5 }).toEqual({ label, ratio: true });
  expect({ label, ratio: contrast(colors.neutral[400], colors.canvas) >= MUTED_MIN_CONTRAST }).toEqual({ label, ratio: true });
}

describe("deriveTheme", () => {
  it("returns the untouched default when nothing is chosen", () => {
    expect(deriveTheme()).toBe(DEFAULT_THEME);
    expect(deriveTheme({ accent: null, base: null, primary: null })).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME.colors).toBe(DEFAULT_COLORS);
  });

  it("treats the default swatches and invalid values as 'not chosen'", () => {
    expect(deriveTheme({ primary: "#db9a34" })).toBe(DEFAULT_THEME);
    expect(deriveTheme({ base: "#F7F3EE" })).toBe(DEFAULT_THEME);
    expect(deriveTheme({ primary: "blue", accent: "#12", base: "" })).toBe(DEFAULT_THEME);
  });

  it("uses the primary as the action colour when no accent is chosen", () => {
    const { colors } = deriveTheme({ primary: "#2F6FDB" });

    expect(colors.accent).toBe(colors.primary[400]);
    expect(colors.onAccent).toBe(colors.onPrimary);
  });

  it("keeps the default primary scale when only the accent or the base is chosen", () => {
    expect(deriveTheme({ accent: "#7A1F2B" }).colors.primary).toBe(DEFAULT_COLORS.primary);
    expect(deriveTheme({ base: "#EEF3F8" }).colors.primary).toBe(DEFAULT_COLORS.primary);
    expect(deriveTheme({ accent: "#7A1F2B" }).colors.accent).toBe("#7A1F2B");
  });

  it("anchors the chosen primary at step 400 when it already has enough contrast", () => {
    const { adjusted, colors } = deriveTheme({ primary: "#7A1F2B" });

    expect(colors.primary[400]).toBe("#7A1F2B");
    expect(colors.onPrimary).toBe("#FFFFFF");
    expect(adjusted.primary).toBe(false);
  });

  it("nudges a colour whose label would be unreadable and says so", () => {
    const { adjusted, colors } = deriveTheme({ primary: "#FFFF00" });

    expect(adjusted.primary).toBe(true);
    expect(contrast(colors.onPrimary, colors.primary[400])).toBeGreaterThanOrEqual(4.5);
    expect(colors.primary[400]).not.toBe("#FFFF00");
  });

  it("produces strictly lighter-to-darker primary steps", () => {
    for (const primary of [...EXTREMES, "#2F6FDB", "#D9588A", "#1BA39C"]) {
      const lightness = STEPS.map((step) => rgbToOklch(hexToRgb(deriveTheme({ primary }).colors.primary[step]))[0]);

      for (let i = 1; i < lightness.length; i++) {
        expect({ primary, i, ok: lightness[i] < lightness[i - 1] }).toEqual({ primary, i, ok: true });
      }
    }
  });

  it("tints the base without changing its lightness structure", () => {
    const blue = deriveTheme({ base: "#EEF3F8" }).colors;
    const grey = deriveTheme({ base: "#F5F5F5" }).colors;

    expect(rgbToOklch(hexToRgb(blue.canvas))[1]).toBeGreaterThan(rgbToOklch(hexToRgb(grey.canvas))[1]);
    expect(blue.ink).toBe(blue.neutral[900]);
    expect(rgbToOklch(hexToRgb(blue.canvas))[0]).toBeCloseTo(rgbToOklch(hexToRgb(DEFAULT_COLORS.canvas))[0], 1);
  });

  it("keeps the fixed colours fixed", () => {
    const { colors } = deriveTheme({ accent: "#2F6FDB", base: "#EEF3F8", primary: "#D9588A" });

    expect(colors.danger).toBe(DEFAULT_COLORS.danger);
    expect(colors.success).toBe(DEFAULT_COLORS.success);
    expect(colors.warning).toBe(DEFAULT_COLORS.warning);
    expect(colors.white).toBe("#FFFFFF");
  });

  it("emits the same variable names as the default theme", () => {
    expect(Object.keys(deriveTheme({ primary: "#2F6FDB" }).vars).sort()).toEqual(Object.keys(DEFAULT_THEME.vars).sort());
  });

  it("meets every contrast contract on the extreme colours, in every position", () => {
    for (const primary of EXTREMES) {
      for (const base of EXTREMES) {
        expectContracts({ accent: EXTREMES[(EXTREMES.indexOf(primary) + 3) % EXTREMES.length], base, primary });
      }
    }
  });

  it("meets every contrast contract on 500 random colours", () => {
    const random = mulberry32(20261111);

    for (let i = 0; i < 500; i++) {
      expectContracts({ accent: randomHex(random), base: randomHex(random), primary: randomHex(random) });
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/theme-derive.test.ts`
Expected: FAIL (`Cannot find module .../theme/derive`).

- [ ] **Step 3: Implementar**

`src/lib/design/theme/derive.ts`:

```ts
import { DEFAULT_COLORS, STEPS, colorsToVars } from "../colors";
import type { Colors, Step } from "../colors";
import { contrast, hexToRgb, oklchToRgb, rgbToHex, rgbToOklch } from "./oklch";

export type ThemeInput = { primary?: string | null; accent?: string | null; base?: string | null };

export type Theme = {
  adjusted: { accent: boolean; primary: boolean };
  colors: Colors;
  vars: Record<string, string>;
};

export const DEFAULT_THEME: Theme = {
  adjusted: { accent: false, primary: false },
  colors: DEFAULT_COLORS,
  vars: colorsToVars(DEFAULT_COLORS),
};

const MIN_TEXT_CONTRAST = 4.5;
const FILL_L_MIN = 0.15;
const FILL_L_MAX = 0.88;
// Secondary text keeps (almost) the contrast the default palette already has; it is not asked to reach 4.5.
export const MUTED_MIN_CONTRAST = contrast(DEFAULT_COLORS.neutral[400], DEFAULT_COLORS.canvas) * 0.98;

type Lch = [number, number, number];

const oklchOf = (hex: string): Lch => rgbToOklch(hexToRgb(hex));
const fromOklch = (L: number, C: number, h: number) => rgbToHex(oklchToRgb(L, C, h).rgb);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ladder = (colors: Record<Step, string>) => Object.fromEntries(STEPS.map((step) => [step, oklchOf(colors[step])])) as Record<Step, Lch>;

const DEFAULT_PRIMARY = ladder(DEFAULT_COLORS.primary);
const DEFAULT_NEUTRAL = ladder(DEFAULT_COLORS.neutral);
const DEFAULT_CANVAS = oklchOf(DEFAULT_COLORS.canvas);
const DEFAULT_SURFACE = oklchOf(DEFAULT_COLORS.surface);
const DEFAULT_MIST = oklchOf(DEFAULT_COLORS.mist);

// A filled surface (button, badge) with a label colour on top that is guaranteed readable.
function deriveFill(hex: string, ink: string) {
  const [L0, C, h] = oklchOf(hex);
  let L = clamp(L0, FILL_L_MIN, FILL_L_MAX);
  let adjusted = L !== L0;

  for (let i = 0; ; i++) {
    const fill = fromOklch(L, C, h);
    const on = contrast(ink, fill) >= contrast("#FFFFFF", fill) ? ink : "#FFFFFF";

    if (contrast(on, fill) >= MIN_TEXT_CONTRAST || i >= 60) {
      return { adjusted, C, fill, h, L, on };
    }
    L += on === ink ? 0.01 : -0.01;
    adjusted = true;
  }
}

type Tones = { canvas: string; ink: string; mist: string; neutral: Record<Step, string>; surface: string };

const DEFAULT_TONES: Tones = {
  canvas: DEFAULT_COLORS.canvas,
  ink: DEFAULT_COLORS.ink,
  mist: DEFAULT_COLORS.mist,
  neutral: DEFAULT_COLORS.neutral,
  surface: DEFAULT_COLORS.surface,
};

// The base only lends its hue and (capped) intensity: lightness per token stays fixed, so text contrast holds.
function deriveBase(hex: string): Tones {
  const [, C0, h] = oklchOf(hex);
  const tint = clamp(C0 / DEFAULT_CANVAS[1], 0, 2);
  const tone = ([L, C]: Lch) => fromOklch(L, C * tint, h);
  const canvas = tone(DEFAULT_CANVAS);
  const surface = tone(DEFAULT_SURFACE);
  const neutral = {} as Record<Step, string>;

  for (const step of STEPS) {
    const [L0, C] = DEFAULT_NEUTRAL[step];
    const need = step >= 500 ? MIN_TEXT_CONTRAST : step === 400 ? MUTED_MIN_CONTRAST : 0;
    let L = L0;
    let colour = fromOklch(L, C * tint, h);

    while (need && L > 0.05 && Math.min(contrast(colour, canvas), contrast(colour, surface)) < need) {
      L -= 0.005;
      colour = fromOklch(L, C * tint, h);
    }
    neutral[step] = colour;
  }

  return { canvas, ink: neutral[900], mist: tone(DEFAULT_MIST), neutral, surface };
}

// The chosen colour anchors step 400; the other steps follow the default lightness ladder around it.
function derivePrimary(hex: string, tones: Tones) {
  const fill = deriveFill(hex, tones.ink);
  const anchor = fill.L;
  const darkEnd = Math.min(DEFAULT_PRIMARY[900][0], anchor - 0.12);
  const chromaScale = clamp(oklchOf(hex)[1] / DEFAULT_PRIMARY[400][1], 0.25, 2);
  const lightness = {} as Record<Step, number>;

  for (const step of STEPS) {
    const [L, ] = DEFAULT_PRIMARY[step];
    if (step === 400) lightness[step] = anchor;
    else if (step < 400) {
      const t = (L - DEFAULT_PRIMARY[400][0]) / (DEFAULT_PRIMARY[50][0] - DEFAULT_PRIMARY[400][0]);
      lightness[step] = anchor + t * (DEFAULT_PRIMARY[50][0] - anchor);
    } else {
      const t = (DEFAULT_PRIMARY[400][0] - L) / (DEFAULT_PRIMARY[400][0] - DEFAULT_PRIMARY[900][0]);
      lightness[step] = anchor - t * (anchor - darkEnd);
    }
  }

  const make = (step: Step) => fromOklch(lightness[step], DEFAULT_PRIMARY[step][1] * chromaScale, fill.h);

  // Step 600 is used as text on the canvas: darken it until it reads, then keep 700-900 below it.
  while (contrast(make(600), tones.canvas) < MIN_TEXT_CONTRAST && lightness[600] > 0.05) lightness[600] -= 0.01;
  for (const step of [700, 800, 900] as const) {
    lightness[step] = Math.min(lightness[step], lightness[(step - 100) as Step] - 0.02);
  }

  const scale = {} as Record<Step, string>;
  for (const step of STEPS) scale[step] = step === 400 ? fill.fill : make(step);

  return { adjusted: fill.adjusted, fill: fill.fill, on: fill.on, scale };
}

// A value equal to the default swatch, or not a #RRGGBB, counts as "not chosen" so the exact default is kept.
function chosen(value: string | null | undefined, defaultHex: string) {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  const hex = value.toUpperCase();

  return hex === defaultHex.toUpperCase() ? null : hex;
}

export function deriveTheme(input: ThemeInput = {}): Theme {
  const primary = chosen(input.primary, DEFAULT_COLORS.primary[400]);
  const accent = chosen(input.accent, DEFAULT_COLORS.accent);
  const base = chosen(input.base, DEFAULT_COLORS.canvas);

  if (!primary && !accent && !base) return DEFAULT_THEME;

  const tones = base ? deriveBase(base) : DEFAULT_TONES;
  const main = primary
    ? derivePrimary(primary, tones)
    : { adjusted: false, fill: DEFAULT_COLORS.primary[400], on: tones.ink, scale: DEFAULT_COLORS.primary };
  const action = accent ? deriveFill(accent, tones.ink) : null;
  const colors: Colors = {
    ...DEFAULT_COLORS,
    accent: action ? action.fill : main.fill,
    canvas: tones.canvas,
    ink: tones.ink,
    mist: tones.mist,
    neutral: tones.neutral,
    onAccent: action ? action.on : main.on,
    onPrimary: main.on,
    primary: main.scale,
    surface: tones.surface,
  };

  return { adjusted: { accent: Boolean(action?.adjusted), primary: main.adjusted }, colors, vars: colorsToVars(colors) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/theme-derive.test.ts`
Expected: PASS. Se algum contrato falhar, a mensagem mostra a cor (`label`). Ajustar a derivação (não afrouxar o teste): casos típicos são o degrau 500/600 ficar acima de 4.5 só para `canvas` mas não `surface` (já coberto pelo `Math.min`) ou o monotônico em âncoras muito escuras (rever `darkEnd`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/theme/derive.ts tests/unit/theme-derive.test.ts
git commit -m "feat(theme): derive full palettes from up to three colours with contrast guarantees"
```

---

### Task 4: Tokens do Tailwind e variáveis padrão no CSS

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `global.css`
- Test: `tests/unit/theme-tokens.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_THEME.vars` (Task 3).
- Produces: classes `bg-accent`, `text-on-accent`, `text-on-primary`, `bg-primary-*`, `bg-canvas`… resolvendo para `rgb(var(--c-…) / alpha)`.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/theme-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import tailwindConfig from "../../tailwind.config";
import { DEFAULT_THEME } from "../../src/lib/design/theme/derive";

describe("theme tokens", () => {
  const css = readFileSync(join(__dirname, "../../global.css"), "utf8");
  const declared = Object.fromEntries([...css.matchAll(/(--c-[a-z0-9-]+):\s*([\d ]+);/g)].map((match) => [match[1], match[2].trim()]));

  it("declares the default Zenc palette in global.css exactly as the defaults", () => {
    expect(declared).toEqual(DEFAULT_THEME.vars);
  });

  it("only references variables that global.css declares", () => {
    const colors = JSON.stringify(tailwindConfig.theme?.extend?.colors);
    const used = new Set([...colors.matchAll(/var\((--c-[a-z0-9-]+)\)/g)].map((match) => match[1]));

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(declared).toHaveProperty(name);
    for (const name of Object.keys(declared)) expect(used).toContain(name);
  });

  it("keeps status colours as fixed hex and removes the unused wine token", () => {
    const colors = tailwindConfig.theme?.extend?.colors as Record<string, unknown>;

    expect(colors.danger).toEqual({ 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" });
    expect(colors).not.toHaveProperty("wine");
    expect(colors).not.toHaveProperty("ink-soft");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/theme-tokens.test.ts`
Expected: FAIL (o CSS não declara as variáveis; o config ainda tem hex e `wine`).

- [ ] **Step 3: Implementar**

`global.css` (substituir o conteúdo; o bloco `:root` é a saída de `colorsToVars(DEFAULT_COLORS)`):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Default Zenc palette as "R G B" triplets. A shop theme overrides these at runtime (see ThemeProvider). */
:root {
  --c-primary-50: 253 246 236;
  --c-primary-100: 250 232 204;
  --c-primary-200: 243 206 143;
  --c-primary-300: 234 177 87;
  --c-primary-400: 219 154 52;
  --c-primary-500: 189 128 32;
  --c-primary-600: 156 104 25;
  --c-primary-700: 120 79 20;
  --c-primary-800: 86 56 14;
  --c-primary-900: 57 37 9;
  --c-accent: 219 154 52;
  --c-on-accent: 23 20 18;
  --c-on-primary: 23 20 18;
  --c-ink: 23 20 18;
  --c-canvas: 247 243 238;
  --c-surface: 255 253 250;
  --c-mist: 236 230 222;
  --c-neutral-50: 250 248 245;
  --c-neutral-100: 242 238 232;
  --c-neutral-200: 228 221 211;
  --c-neutral-300: 203 191 175;
  --c-neutral-400: 156 142 123;
  --c-neutral-500: 115 101 85;
  --c-neutral-600: 86 74 61;
  --c-neutral-700: 61 51 39;
  --c-neutral-800: 42 35 26;
  --c-neutral-900: 23 20 18;
}
```

`tailwind.config.ts`: acrescentar, acima de `export default`, e trocar o bloco `colors` de `theme.extend`:

```ts
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (name: string) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [step, token(`${name}-${step}`)]));
```

```ts
      colors: {
        primary: scale("primary"),
        accent: token("accent"),
        "on-accent": token("on-accent"),
        "on-primary": token("on-primary"),
        ink: token("ink"),
        canvas: token("canvas"),
        surface: token("surface"),
        mist: token("mist"),
        neutral: scale("neutral"),
        danger: { 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" },
        success: { 500: "#2F9E5B" },
        warning: { 400: "#E8A93B", 500: "#C98A1F" },
      },
```

(Os blocos `spacing` e `fontFamily` ficam como estão.)

- [ ] **Step 4: Rodar e ver passar; exportar para a web**

Run: `npx jest --runInBand tests/unit/theme-tokens.test.ts && npm run typecheck`
Expected: PASS.
Run: `EXPO_NO_DOTENV=1 EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test-publishable-key npx expo export --platform web --output-dir /tmp/claude-1000/-home-samuel-projects-barberschedule/f22508cf-ec52-415f-9e57-7ec836eea3e6/scratchpad/theme-export 2>&1 | tail -3`
Expected: exporta sem erro, e `grep -c "var(--c-accent)" /tmp/claude-1000/-home-samuel-projects-barberschedule/f22508cf-ec52-415f-9e57-7ec836eea3e6/scratchpad/theme-export/_expo/static/css/*.css` mostra ao menos 1 (a classe `bg-accent` só aparece quando algum arquivo a usar; se 0 aqui, repetir esta checagem na Task 8).

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts global.css tests/unit/theme-tokens.test.ts
git commit -m "feat(theme): Tailwind colour tokens read CSS variables; default palette in global.css"
```

---

### Task 5: `AppThemeProvider`, `ThemeScope` e `useColors`

**Files:**
- Create: `src/lib/design/theme/ThemeProvider.tsx`
- Test: `tests/unit/theme-provider.test.tsx` (**nota:** o `jest.config.js` só casa `*.test.ts`; usar `tests/unit/theme-provider.test.ts` com `React.createElement`, sem JSX)
- Modify: `app/_layout.tsx` (monta o provider; o fundo dos navegadores usa o hook)
- Modify: `tests/unit/root-layout.test.ts`

**Interfaces:**
- Consumes: `deriveTheme`, `DEFAULT_THEME`, `Theme`, `ThemeInput` (Task 3).
- Produces (em `src/lib/design/theme/ThemeProvider.tsx`):
  - `AppThemeProvider({ input?: ThemeInput | null; children })`
  - `ThemeScope({ input: ThemeInput | null; className?: string; children })`
  - `useColors(): Colors`, `useTheme(): Theme`

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/theme-provider.test.ts`:

```ts
import React from "react";
import { Platform } from "react-native";
import { render } from "@testing-library/react-native";

import { DEFAULT_COLORS } from "../../src/lib/design/colors";
import { deriveTheme } from "../../src/lib/design/theme/derive";
import { AppThemeProvider, ThemeScope, useColors, useTheme } from "../../src/lib/design/theme/ThemeProvider";

function Probe({ onColors }: { onColors: (colors: ReturnType<typeof useColors>) => void }) {
  onColors(useColors());

  return null;
}

describe("AppThemeProvider", () => {
  it("falls back to the default colours without a provider", () => {
    const seen: unknown[] = [];

    render(React.createElement(Probe, { onColors: (colors) => seen.push(colors) }));

    expect(seen[0]).toBe(DEFAULT_COLORS);
  });

  it("exposes the derived colours of a custom theme", () => {
    const seen: Array<typeof DEFAULT_COLORS> = [];

    render(
      React.createElement(
        AppThemeProvider,
        { input: { primary: "#2F6FDB" } },
        React.createElement(Probe, { onColors: (colors) => seen.push(colors) }),
      ),
    );

    expect(seen[0]).toEqual(deriveTheme({ primary: "#2F6FDB" }).colors);
    expect(seen[0].primary[400]).toBe(deriveTheme({ primary: "#2F6FDB" }).colors.primary[400]);
  });

  it("scopes a theme to its subtree", () => {
    const outer: unknown[] = [];
    const inner: unknown[] = [];

    render(
      React.createElement(
        AppThemeProvider,
        { input: null },
        React.createElement(Probe, { onColors: (colors) => outer.push(colors) }),
        React.createElement(ThemeScope, { input: { accent: "#7A1F2B" } }, React.createElement(Probe, { onColors: (colors) => inner.push(colors) })),
      ),
    );

    expect(outer[0]).toBe(DEFAULT_COLORS);
    expect((inner[0] as typeof DEFAULT_COLORS).accent).toBe("#7A1F2B");
  });

  it("exposes the adjusted flags through useTheme", () => {
    let adjusted: boolean | undefined;
    const Reader = () => {
      adjusted = useTheme().adjusted.primary;

      return null;
    };

    render(React.createElement(AppThemeProvider, { input: { primary: "#FFFF00" } }, React.createElement(Reader)));

    expect(adjusted).toBe(true);
  });
});

describe("AppThemeProvider on the web", () => {
  const style = { removeProperty: jest.fn(), setProperty: jest.fn() };

  beforeEach(() => {
    style.removeProperty.mockClear();
    style.setProperty.mockClear();
    jest.replaceProperty(Platform, "OS", "web");
    (globalThis as { document?: unknown }).document = { documentElement: { style } };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as { document?: unknown }).document;
  });

  it("writes nothing for the default theme", () => {
    render(React.createElement(AppThemeProvider, { input: null }, React.createElement(Probe, { onColors: () => undefined })));

    expect(style.setProperty).not.toHaveBeenCalled();
  });

  it("writes the variables on the document so portalled modals inherit them, and removes them on unmount", () => {
    const view = render(React.createElement(AppThemeProvider, { input: { primary: "#2F6FDB" } }, React.createElement(Probe, { onColors: () => undefined })));
    const vars = deriveTheme({ primary: "#2F6FDB" }).vars;

    expect(style.setProperty).toHaveBeenCalledWith("--c-accent", vars["--c-accent"]);
    expect(style.setProperty).toHaveBeenCalledTimes(Object.keys(vars).length);

    view.unmount();

    expect(style.removeProperty).toHaveBeenCalledWith("--c-accent");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/theme-provider.test.ts`
Expected: FAIL (`Cannot find module .../ThemeProvider`).

- [ ] **Step 3: Implementar**

`src/lib/design/theme/ThemeProvider.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo } from "react";
import type { PropsWithChildren } from "react";
import { Platform, View } from "react-native";
import { vars } from "nativewind";

import type { Colors } from "../colors";
import { DEFAULT_THEME, deriveTheme } from "./derive";
import type { Theme, ThemeInput } from "./derive";

const ThemeContext = createContext<Theme>(DEFAULT_THEME);

export const useTheme = () => useContext(ThemeContext);
export const useColors = (): Colors => useContext(ThemeContext).colors;

function useDerived(input: ThemeInput | null | undefined) {
  return useMemo(() => deriveTheme(input ?? undefined), [input?.primary, input?.accent, input?.base]);
}

// Web: the variables go on <html>, because react-native-web renders Modal into document.body, outside the app root.
// Native: a root View with NativeWind's vars(); React context crosses Modal, so pop-ups inherit it. The default palette
// is always applied on native so it does not depend on :root being honoured there.
export function AppThemeProvider({ input, children }: PropsWithChildren<{ input?: ThemeInput | null }>) {
  const theme = useDerived(input);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || theme === DEFAULT_THEME) return undefined;
    const style = document.documentElement.style;
    const names = Object.keys(theme.vars);

    for (const name of names) style.setProperty(name, theme.vars[name]);

    return () => {
      for (const name of names) style.removeProperty(name);
    };
  }, [theme]);

  const content = <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;

  if (Platform.OS === "web") return content;

  return (
    <View className="flex-1" style={vars(theme.vars)}>
      {content}
    </View>
  );
}

// A theme limited to a subtree (the Appearance preview): same vars(), scoped to one View.
export function ThemeScope({ input, className, children }: PropsWithChildren<{ className?: string; input: ThemeInput | null }>) {
  const theme = useDerived(input);

  return (
    <ThemeContext.Provider value={theme}>
      <View className={className} style={vars(theme.vars)}>
        {children}
      </View>
    </ThemeContext.Provider>
  );
}
```

`app/_layout.tsx`: substituir as linhas de `colors`/`theme` de módulo e o provider:

```tsx
// remover:  import { colors } from "../src/lib/design/colors";
// remover:  const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas } };
import { AppThemeProvider, useColors } from "../src/lib/design/theme/ThemeProvider";
```

Dentro de `RootNavigator`, logo depois de `const router = useRouter();`:

```tsx
  const colors = useColors();
  // The navigators paint their own scene background from this theme; the default grey showed between pages.
  const navigationTheme = useMemo(
    () => ({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas } }),
    [colors.canvas],
  );
```

e trocar `<ThemeProvider value={theme}>` por `<ThemeProvider value={navigationTheme}>`. Em `RootLayout`:

```tsx
      <AppProviders>
        <AppThemeProvider>
          <RootNavigator />
        </AppThemeProvider>
      </AppProviders>
```

`tests/unit/root-layout.test.ts`: trocar `import { colors } from "../../src/lib/design/colors";` por `import { DEFAULT_COLORS } from "../../src/lib/design/colors";` e `colors.canvas` por `DEFAULT_COLORS.canvas` nas asserções. Se `RootLayout` agora renderizar um `View` extra (provider nativo), manter as asserções existentes de `GestureHandlerRootView`/`Stack` (elas olham filhos por `jest.mocked`, não a árvore).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/theme-provider.test.ts tests/unit/root-layout.test.ts && npm run typecheck`
Expected: PASS. Se `vars` não for exportado por `nativewind` nesta versão, o typecheck acusa aqui: parar e voltar ao spec (risco técnico registrado), não improvisar outro mecanismo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/design/theme/ThemeProvider.tsx tests/unit/theme-provider.test.ts app/_layout.tsx tests/unit/root-layout.test.ts
git commit -m "feat(theme): AppThemeProvider, ThemeScope and useColors; root layout reads the canvas from the theme"
```

---

### Task 6: Gate do `vars` na web (e2e Playwright, inclui `Modal`)

**Files:**
- Create: `tests/e2e/theme-vars.web.spec.ts`

**Interfaces:**
- Consumes: classes `bg-primary-400` do `Button` (ainda primário nesta task) e o CSS da Task 4.

Esta task prova, no navegador real, que (a) o padrão continua âmbar e (b) uma variável escrita em `<html>` repinta a tela. É o "spike" do spec: se falhar, **parar** e rever o desenho.

- [ ] **Step 1: Escrever o teste**

`tests/e2e/theme-vars.web.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("the default palette is amber and a CSS variable on <html> repaints the sign-in button", async ({ page }) => {
  await page.goto("/");
  const submit = page.getByRole("button", { name: "Sign in" });

  await expect(submit).toBeVisible();
  const background = () => submit.evaluate((node) => getComputedStyle(node).backgroundColor);

  // Button still uses the primary token in this task; the accent token takes over in the action-colour task.
  await expect.poll(background).toBe("rgb(219, 154, 52)");

  await page.evaluate(() => document.documentElement.style.setProperty("--c-primary-400", "47 111 219"));

  await expect.poll(background).toBe("rgb(47, 111, 219)");
});
```

- [ ] **Step 2: Exportar e rodar**

Usar o script `run-e2e-final.sh` do scratchpad, restrito ao spec (ou os passos manuais: mover `.env.local` para o scratchpad, `npm run e2e:export`, servir `.e2e-dist` na 4173, `npx playwright test -c playwright.chrome.config.ts tests/e2e/theme-vars.web.spec.ts`, parar o servidor **por PID**, devolver `.env.local`).
Expected: PASS. Se o primeiro `poll` falhar (cor diferente de âmbar), o `rgb(var(...) / <alpha-value>)` não resolveu na exportação web: parar e investigar (a causa provável é o `global.css` ou o preset do NativeWind).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/theme-vars.web.spec.ts
git commit -m "test(theme): e2e gate for CSS variable theming on the web export"
```

---

### Task 7: Migrar os arquivos que usam `colors` para `useColors()`

**Files (29):**
`app/(auth)/signup.tsx`, `app/(customer)/(tabs)/_layout.tsx`, `app/(customer)/(tabs)/profile.tsx`, `app/(owner)/revenue.tsx`, `app/(owner)/settings.tsx`, `app/(owner)/shop.tsx`, `app/(professional)/earnings.tsx`, `app/(professional)/my-profile/index.tsx`, `app/(professional)/my-profile/services.tsx`, `src/components/charts/ColumnChart.tsx`, `src/components/charts/DonutChart.tsx`, `src/components/domain/AppointmentCard.tsx`, `AppointmentSheet.tsx`, `Avatar.tsx`, `BottomTabBar.tsx`, `ContactLink.tsx`, `EmptyState.tsx`, `MenuBlock.tsx`, `MonthCalendar.tsx`, `NotificationBell.tsx`, `ProfessionalCard.tsx`, `RadioBlock.tsx`, `RatingStars.tsx`, `ScreenHeader.tsx`, `ServiceCard.tsx`, `src/components/ui/FabAdd.tsx`, `src/components/ui/SearchInput.tsx`, `src/features/notifications/NotificationsScreen.tsx`; `tests/unit/rating-stars.test.ts` (importa `colors`).
(`app/_layout.tsx` já foi migrado na Task 5.)

**Interfaces:**
- Consumes: `useColors(): Colors` (Task 5).

Receita (idêntica para cada arquivo):
1. Trocar `import { colors } from "<rel>/design/colors";` por `import { useColors } from "<rel>/design/theme/ThemeProvider";` (mesmo prefixo relativo; o arquivo novo vive em `design/theme/`).
2. Em **cada componente de função** do arquivo que mencione `colors.`, acrescentar como primeira instrução do corpo (antes de qualquer `return` antecipado): `const colors = useColors();`.
3. Funções auxiliares fora de componente que usam `colors` recebem `colors` como parâmetro (`Colors` de `../design/colors`).
4. Ao final, **nenhum** arquivo de `app/` ou `src/` (exceto `src/lib/design/**`) importa `design/colors`. O typecheck acusa qualquer uso esquecido (`Cannot find name 'colors'`).

- [ ] **Step 1: Lote 1 — `src/components/**` (domain, ui, charts)**

Para cada arquivo do lote: aplicar a receita; conferir com `grep -n "colors\." <arquivo>` que cada ocorrência está dentro de um componente que declara `const colors = useColors();`.
Run: `npm run typecheck && npx jest --runInBand`
Expected: typecheck limpo; Jest verde (os testes renderizam sem provider e recebem `DEFAULT_COLORS`).

- [ ] **Step 2: Commit do lote 1**

```bash
git add src/components
git commit -m "refactor(theme): components read colours from useColors()"
```

- [ ] **Step 3: Lote 2 — `app/**` e `src/features/notifications/NotificationsScreen.tsx`**

Aplicar a receita; `app/(owner)/shop.tsx` e `settings.tsx` têm vários componentes internos: conferir cada um.
Run: `npm run typecheck && npx eslint app src tests scripts && npx jest --runInBand`
Expected: tudo verde.

- [ ] **Step 4: Testes que importam `colors`**

`tests/unit/rating-stars.test.ts`: trocar o import para `DEFAULT_COLORS` e `colors.` por `DEFAULT_COLORS.` nas asserções.
Run: `npx jest --runInBand tests/unit/rating-stars.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar que nada importa mais o alias**

Run: `grep -rln "design/colors" app src tests | grep -v "src/lib/design"`
Expected: só `tests/unit/colors.test.ts`, `tests/unit/theme-*.test.ts`, `tests/unit/root-layout.test.ts`, `tests/unit/rating-stars.test.ts` (que importam `DEFAULT_COLORS`/`colorsToVars`), e nenhum arquivo de `app/` ou `src/components`.

- [ ] **Step 6: Commit do lote 2**

```bash
git add app src tests
git commit -m "refactor(theme): screens and features read colours from useColors()"
```

---

### Task 8: Destaque nos botões de ação; remover o alias `colors`

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/FabAdd.tsx`
- Modify: `src/components/domain/Avatar.tsx` (ícone do selo)
- Modify: `app/(auth)/signup.tsx` (ícone do checkbox)
- Modify: `src/lib/design/colors.ts` (remover o alias temporário `colors`)
- Modify: `tests/e2e/theme-vars.web.spec.ts`
- Test: `tests/unit/button.test.ts` (criar se não existir; senão estender o teste do `Button`)

**Interfaces:**
- Consumes: classes `bg-accent`, `text-on-accent`, `text-on-primary` (Task 4) e `useColors()` (`onAccent`, `onPrimary`).

- [ ] **Step 1: Escrever os testes que falham**

Verificar se já há teste do `Button`: `grep -rln "components/ui/Button" tests/unit`. Se houver, acrescentar nele; senão criar `tests/unit/button-accent.test.ts`:

```ts
import React from "react";
import { render } from "@testing-library/react-native";

import { Button } from "../../src/components/ui/Button";

describe("Button action colour", () => {
  it("fills the primary variant with the accent token and the on-accent label", () => {
    const view = render(React.createElement(Button, { label: "Book", onPress: () => undefined }));
    const pressable = view.getByRole("button");

    expect(pressable.props.className).toContain("bg-accent");
    expect(pressable.props.className).not.toContain("bg-primary-400");
    expect(view.getByText("Book").props.className).toContain("text-on-accent");
  });

  it("keeps the ghost variant on the primary identity colour", () => {
    const view = render(React.createElement(Button, { label: "More", onPress: () => undefined, variant: "ghost" }));

    expect(view.getByText("More").props.className).toContain("text-primary-600");
  });
});
```

E em `tests/e2e/theme-vars.web.spec.ts` trocar a variável e o comentário:

```ts
  // The primary Button is filled with the accent token.
  await page.evaluate(() => document.documentElement.style.setProperty("--c-accent", "47 111 219"));
```
(substituindo `--c-primary-400`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/button-accent.test.ts`
Expected: FAIL (`bg-primary-400` ainda presente).

- [ ] **Step 3: Implementar**

`Button.tsx`: `primary: "bg-accent"` em `VARIANT_CLASSNAME` e `primary: "text-on-accent"` em `VARIANT_TEXT_CLASSNAME`.

`FabAdd.tsx`: `className="… bg-accent"` (no lugar de `bg-primary-400`), e o ícone `const colors = useColors(); … <Plus color={colors.onAccent} size={28} />` (o import de `useColors` já veio da Task 7; trocar `colors.ink` por `colors.onAccent`).

`Avatar.tsx` (selo de edição, `bg-primary-400`): conferir o ícone dentro dele e usar `colors.onPrimary` em vez de `colors.ink`/`colors.white`, se houver.
`signup.tsx` (checkbox marcado, `bg-primary-400`): idem, ícone com `colors.onPrimary`.

`src/lib/design/colors.ts`: apagar as duas últimas linhas (o comentário e `export const colors = DEFAULT_COLORS;`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run typecheck && npx eslint app src tests scripts && npx jest --runInBand`
Expected: tudo verde (typecheck acusa qualquer import que ainda use `colors`).

- [ ] **Step 5: Commit**

```bash
git add -A src app tests
git commit -m "feat(theme): action buttons use the accent token; drop the temporary colors alias"
```

---

### Task 9: Verificação da PARTE A, decisão e PR A

**Files:**
- Create: `docs/decisions/016-shop-theme.md`

- [ ] **Step 1: Verificação completa**

Run: `npm run typecheck && npx eslint app src tests scripts && npm test -- --runInBand && npm run test:e2e:runner`
Expected: tudo verde.
Run (pgTAP não muda, mas confirmar): `npx supabase test db 2>&1 | grep -E "^Files=|^Result"` — se falhar só no `010_full_rls.sql`, é por causa das contas de dev (conhecido); para o verde limpo, `npx supabase db reset`, rodar de novo e recriar `dev-owner.sql`/`dev-professional.sql`.

- [ ] **Step 2: e2e completo**

Rodar a suíte inteira com o script do scratchpad (`run-e2e-final.sh`). Expected: tudo verde exceto as duas falhas conhecidas (`back-navigation` "customer › profile sub-screens" e a instável `booking` "step indicator"); qualquer outra é regressão do tema: investigar.

- [ ] **Step 3: Conferência visual no navegador**

Com o bundle exportado e servido, abrir no navegador embutido as telas de entrada e, logado com os mocks do e2e, cliente/dono/profissional: o visual deve ser idêntico ao de antes (botões âmbar, fundo `canvas`). Registrar CSS computado do botão (`rgb(219, 154, 52)`) e do fundo (`rgb(247, 243, 238)`).

- [ ] **Step 4: Decisão**

`docs/decisions/016-shop-theme.md`:

```markdown
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
  `ink` on `canvas`/`surface` >= 4.5. Known gap in the untouched default: `primary-600` on `canvas` is 4.31.
- `AppThemeProvider` writes the variables on `<html>` on the web (react-native-web renders `Modal` into `document.body`)
  and uses NativeWind `vars()` on a root View on native, where React context crosses `Modal`.
- JS code that needs a colour calls `useColors()`; danger/success/warning/white, chart colours, status bar, splash and
  icon are fixed.

## Consequences

- No dark mode per shop (separate project). No logo upload. The theme applies after sign-in; the pre-sign-in theme per
  `<slug>.zencpro.app` belongs to the shop-resolution sub-project.
- `vars()` on a real device is not verified by automated tests: check on a phone after the first release build.
```

- [ ] **Step 5: Commit, push e PR A**

```bash
git add docs/decisions/016-shop-theme.md
git commit -m "docs: decision 016, per-shop colour theme"
git push -u origin feat-theme-tokens
gh pr create --base main --head feat-theme-tokens --title "feat(theme): colour tokens, palette derivation and theme provider" --body-file <arquivo com o corpo>
```

Corpo do PR: resumo (tokens por variável CSS, derivação, provider, `useColors`, botões de ação em `accent`, sem mudança visual no padrão), verificação (números reais), riscos (`vars()` no nativo só verificado por teste unitário; teste no celular pendente) e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Depois: `get_status`, e se não estiver ligado, `bind_pr`; ligar o Auto-fix (`set_monitor`).

---

# PARTE B — PR B: tema da loja (branch `feat-shop-theme`, a partir de `feat-theme-tokens`)

```bash
git checkout -b feat-shop-theme
```

### Task 10: Migration `0066` e pgTAP

**Files:**
- Create: `supabase/migrations/0066_shop_theme.sql`
- Create: `supabase/tests/048_shop_theme.sql`

- [ ] **Step 1: Escrever o teste que falha**

`supabase/tests/048_shop_theme.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at)
values
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 't48-owner@example.com', 'password-hash', now()),
  ('00000000-0000-0000-0000-000000000000', 'f8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 't48-customer@example.com', 'password-hash', now());

update public.profiles set role = 'owner' where user_id = 'f8000000-0000-0000-0000-000000000001';

insert into public.shops (id, name, owner_user_id)
values ('f8100000-0000-0000-0000-000000000001', 'T48 Shop', 'f8000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ update public.shops set theme_primary = 'blue' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  '23514', null, 'a colour must be #RRGGBB'
);

select lives_ok(
  $$ update public.shops set theme_primary = '#2F6FDB' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  'a valid colour is accepted'
);

set local role anon;
select results_eq(
  $$ select theme_primary from public.shops where id = 'f8100000-0000-0000-0000-000000000001' $$,
  $$ values ('#2F6FDB'::text) $$,
  'anonymous visitors can read the theme'
);
select throws_ok(
  $$ update public.shops set theme_base = '#FFFFFF' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  '42501', null, 'anonymous visitors cannot write the theme'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f8000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$ update public.shops set theme_accent = '#7A1F2B' where id = 'f8100000-0000-0000-0000-000000000001' $$,
  'the owner writes the theme'
);
select results_eq(
  $$ select theme_accent from public.shops where id = 'f8100000-0000-0000-0000-000000000001' $$,
  $$ values ('#7A1F2B'::text) $$,
  'the owner reads back what they wrote'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f8000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(
  (with changed as (update public.shops set theme_accent = '#000000' where id = 'f8100000-0000-0000-0000-000000000001' returning 1) select count(*)::int from changed),
  0,
  'a customer changes no row'
);
reset role;

select is(
  (select theme_accent from public.shops where id = 'f8100000-0000-0000-0000-000000000001'),
  '#7A1F2B',
  'the accent is untouched by the customer'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx supabase test db 2>&1 | grep -E "048_shop_theme|Result"`
Expected: `048_shop_theme.sql` falha (coluna `theme_primary` inexistente).

- [ ] **Step 3: Implementar**

`supabase/migrations/0066_shop_theme.sql`:

```sql
-- Per-shop colours (white-label theme). Null means the Zenc default; a null accent follows the primary.
-- Readable by everyone (the booking pages and sign-in will need it); writable only by the shop owner through the
-- existing shops_update_owner policy.
alter table public.shops
  add column theme_primary text,
  add column theme_accent text,
  add column theme_base text,
  add constraint shops_theme_primary_hex check (theme_primary is null or theme_primary ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint shops_theme_accent_hex check (theme_accent is null or theme_accent ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint shops_theme_base_hex check (theme_base is null or theme_base ~ '^#[0-9A-Fa-f]{6}$');

grant select (theme_primary, theme_accent, theme_base) on table public.shops to anon, authenticated;
grant update (theme_primary, theme_accent, theme_base) on table public.shops to authenticated;
```

- [ ] **Step 4: Aplicar e ver passar**

Run: `npx supabase migration up 2>&1 | tail -2 && npx supabase test db 2>&1 | grep -E "^Files=|^Result|048"`
Expected: migration aplicada; `048` passa (8 testes). Se o banco local tiver contas de dev, o `010` pode falhar como antes; o verde limpo vem do `db reset` na Task 15.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0066_shop_theme.sql supabase/tests/048_shop_theme.sql
git commit -m "feat(db): shop theme colours with owner-only writes"
```

---

### Task 11: API, validação e cache do tema da loja

**Files:**
- Create: `src/features/shops/theme.ts`
- Test: `tests/unit/shop-theme.test.ts`

**Interfaces:**
- Consumes: `ThemeInput` (Task 3), `toDomainError` (`src/lib/errors/domain-errors`), `createKeyValueStorage`/helpers de `src/lib/key-value-storage.ts` (ver Step 1).
- Produces:
  - `normalizeThemeColor(value: string): string | null` (aceita com ou sem `#`, 6 hex, devolve `#RRGGBB` maiúsculo; `""` → `null`; inválido → `undefined`... ver contrato abaixo)
  - `getShopTheme(supabase): Promise<{ shopId: string; input: ThemeInput } | null>`
  - `updateShopTheme(supabase, shopId, input: { primary: string | null; accent: string | null; base: string | null }): Promise<void>`
  - `readCachedTheme(userId: string): Promise<ThemeInput | null>`, `writeCachedTheme(userId: string, input: ThemeInput): Promise<void>`

Contrato de `normalizeThemeColor(value)`: `value.trim()`; vazio → `{ ok: true, value: null }`; `#?[0-9A-Fa-f]{6}` → `{ ok: true, value: "#RRGGBB" }`; resto → `{ ok: false }`. Devolve esse objeto (não `null`/`undefined` ambíguos).

- [ ] **Step 1: Escrever o teste que falha**

Antes, ver a API do storage: `sed -n 25,80p src/lib/key-value-storage.ts` e usar os nomes exportados reais (`keyValueStorage` ou equivalente) no teste e na implementação. O teste abaixo assume `import { keyValueStorage } from "../../src/lib/key-value-storage"`; ajustar o nome se for outro, sem mudar o comportamento testado.

`tests/unit/shop-theme.test.ts`:

```ts
import { getShopTheme, normalizeThemeColor, readCachedTheme, updateShopTheme, writeCachedTheme } from "../../src/features/shops/theme";

describe("normalizeThemeColor", () => {
  it("accepts six hex digits with or without #, in any case", () => {
    expect(normalizeThemeColor("2f6fdb")).toEqual({ ok: true, value: "#2F6FDB" });
    expect(normalizeThemeColor(" #2f6fdb ")).toEqual({ ok: true, value: "#2F6FDB" });
  });

  it("maps an empty field to 'not chosen'", () => {
    expect(normalizeThemeColor("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects anything else", () => {
    for (const value of ["blue", "#12", "#GGGGGG", "#2F6FDB0"]) {
      expect(normalizeThemeColor(value)).toEqual({ ok: false });
    }
  });
});

function fakeClient(result: { data?: unknown; error?: unknown }) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};

  builder.select = (columns: string) => { calls.select = columns; return builder; };
  builder.order = () => builder;
  builder.limit = () => Promise.resolve(result);
  builder.update = (payload: unknown) => { calls.update = payload; return builder; };
  builder.eq = (column: string, value: string) => { calls.eq = [column, value]; return Promise.resolve(result); };

  return { calls, client: { from: (table: string) => { calls.table = table; return builder; } } as never };
}

describe("getShopTheme", () => {
  it("reads the id and the three colours of the first shop", async () => {
    const { calls, client } = fakeClient({ data: [{ id: "s1", theme_accent: null, theme_base: "#EEF3F8", theme_primary: "#2F6FDB" }] });

    await expect(getShopTheme(client)).resolves.toEqual({ input: { accent: null, base: "#EEF3F8", primary: "#2F6FDB" }, shopId: "s1" });
    expect(calls.table).toBe("shops");
    expect(calls.select).toBe("id, theme_primary, theme_accent, theme_base");
  });

  it("returns null when there is no shop", async () => {
    await expect(getShopTheme(fakeClient({ data: [] }).client)).resolves.toBeNull();
  });

  it("throws the database error", async () => {
    await expect(getShopTheme(fakeClient({ error: new Error("boom") }).client)).rejects.toThrow("boom");
  });
});

describe("updateShopTheme", () => {
  it("writes the three columns for the shop", async () => {
    const { calls, client } = fakeClient({});

    await updateShopTheme(client, "s1", { accent: null, base: "#EEF3F8", primary: "#2F6FDB" });

    expect(calls.update).toEqual({ theme_accent: null, theme_base: "#EEF3F8", theme_primary: "#2F6FDB" });
    expect(calls.eq).toEqual(["id", "s1"]);
  });

  it("refuses an invalid colour before calling the database", async () => {
    const { calls, client } = fakeClient({});

    await expect(updateShopTheme(client, "s1", { accent: null, base: null, primary: "blue" })).rejects.toThrow();
    expect(calls.update).toBeUndefined();
  });
});

describe("cached theme", () => {
  it("round-trips per user and ignores corrupt data", async () => {
    await writeCachedTheme("u1", { accent: null, base: null, primary: "#2F6FDB" });

    await expect(readCachedTheme("u1")).resolves.toEqual({ accent: null, base: null, primary: "#2F6FDB" });
    await expect(readCachedTheme("u2")).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/shop-theme.test.ts`
Expected: FAIL (`Cannot find module .../shops/theme`).

- [ ] **Step 3: Implementar**

`src/features/shops/theme.ts` (ajustar o import do storage ao nome real visto no Step 1):

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ThemeInput } from "../../lib/design/theme/derive";
import { toDomainError } from "../../lib/errors/domain-errors";
import { keyValueStorage } from "../../lib/key-value-storage";

export type ShopThemeValues = { accent: string | null; base: string | null; primary: string | null };

const HEX = /^#?([0-9A-Fa-f]{6})$/;

export function normalizeThemeColor(value: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim();

  if (!trimmed) return { ok: true, value: null };
  const match = HEX.exec(trimmed);

  return match ? { ok: true, value: `#${match[1].toUpperCase()}` } : { ok: false };
}

// Single-shop MVP, like the other shop screens: the first shop is the current one.
export async function getShopTheme(supabase: Pick<SupabaseClient, "from">): Promise<{ input: ShopThemeValues; shopId: string } | null> {
  const { data, error } = await supabase.from("shops").select("id, theme_primary, theme_accent, theme_base").order("name").limit(1);

  if (error) throw error;
  const shop = (data as Array<{ id: string; theme_accent: string | null; theme_base: string | null; theme_primary: string | null }> | null)?.[0];

  return shop ? { input: { accent: shop.theme_accent, base: shop.theme_base, primary: shop.theme_primary }, shopId: shop.id } : null;
}

export async function updateShopTheme(supabase: Pick<SupabaseClient, "from">, shopId: string, input: ShopThemeValues) {
  for (const value of [input.primary, input.accent, input.base]) {
    if (value !== null && !HEX.test(value)) throw new Error("Theme colours must be #RRGGBB.");
  }

  const { error } = await supabase
    .from("shops")
    .update({ theme_accent: input.accent, theme_base: input.base, theme_primary: input.primary })
    .eq("id", shopId);

  if (error) throw toDomainError(error);
}

const cacheKey = (userId: string) => `zenc.shop-theme.${userId}`;

export async function readCachedTheme(userId: string): Promise<ThemeInput | null> {
  try {
    const raw = await keyValueStorage.getItem(cacheKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const pick = (key: string) => (typeof parsed?.[key] === "string" && HEX.test(parsed[key] as string) ? (parsed[key] as string) : null);

    return parsed ? { accent: pick("accent"), base: pick("base"), primary: pick("primary") } : null;
  } catch {
    return null;
  }
}

export async function writeCachedTheme(userId: string, input: ThemeInput) {
  try {
    await keyValueStorage.setItem(cacheKey(userId), JSON.stringify(input));
  } catch {
    // The cache only avoids a flash of the default colours; losing it is harmless.
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/shop-theme.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shops/theme.ts tests/unit/shop-theme.test.ts
git commit -m "feat(theme): shop theme api, colour validation and per-user cache"
```

---

### Task 12: `useShopTheme` e o provider da loja no layout raiz

**Files:**
- Create: `src/features/shops/ShopThemeProvider.tsx`
- Modify: `app/_layout.tsx`
- Test: `tests/unit/shop-theme-provider.test.ts`

**Interfaces:**
- Consumes: `getShopTheme`, `readCachedTheme`, `writeCachedTheme` (Task 11); `AppThemeProvider` (Task 5); `useSupabaseSession` (`session`, `supabase`).
- Produces:
  - `useShopTheme(): { data: { input: ShopThemeValues; shopId: string } | null | undefined; isReady: boolean }` (query key `["shop-theme"]`, invalidada pela tela Aparência)
  - `ShopThemeProvider({ children })`: monta `AppThemeProvider` com o tema da loja quando há sessão; mantém uma tela de carregamento enquanto há sessão e o tema ainda não foi resolvido nem lido do cache.

- [ ] **Step 1: Escrever o teste que falha**

`tests/unit/shop-theme-provider.test.ts`:

```ts
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/shops/theme", () => ({
  getShopTheme: jest.fn(),
  readCachedTheme: jest.fn(),
  writeCachedTheme: jest.fn(),
}));

import { getShopTheme, readCachedTheme, writeCachedTheme } from "../../src/features/shops/theme";
import { ShopThemeProvider } from "../../src/features/shops/ShopThemeProvider";
import { DEFAULT_COLORS } from "../../src/lib/design/colors";
import { deriveTheme } from "../../src/lib/design/theme/derive";
import { useColors } from "../../src/lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const session = jest.mocked(useSupabaseSession);
const fetchTheme = jest.mocked(getShopTheme);
const cached = jest.mocked(readCachedTheme);
const saved = jest.mocked(writeCachedTheme);

function Probe({ onColors }: { onColors: (colors: typeof DEFAULT_COLORS) => void }) {
  onColors(useColors());

  return null;
}

function renderProvider(onColors: (colors: typeof DEFAULT_COLORS) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ShopThemeProvider, null, React.createElement(Probe, { onColors })),
    ),
  );
}

describe("ShopThemeProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cached.mockResolvedValue(null);
  });

  it("shows the default theme and does not fetch without a session", () => {
    session.mockReturnValue({ isLoading: false, profile: null, session: null, supabase: {} } as never);
    const seen: Array<typeof DEFAULT_COLORS> = [];

    renderProvider((colors) => seen.push(colors));

    expect(seen[0]).toBe(DEFAULT_COLORS);
    expect(fetchTheme).not.toHaveBeenCalled();
  });

  it("applies the shop colours after sign-in and caches them for the next launch", async () => {
    session.mockReturnValue({ isLoading: false, profile: { userId: "u1" }, session: { user: { id: "u1" } }, supabase: {} } as never);
    fetchTheme.mockResolvedValue({ input: { accent: null, base: null, primary: "#2F6FDB" }, shopId: "s1" });
    const seen: Array<typeof DEFAULT_COLORS> = [];

    renderProvider((colors) => seen.push(colors));

    await waitFor(() => expect(seen[seen.length - 1].primary[400]).toBe(deriveTheme({ primary: "#2F6FDB" }).colors.primary[400]));
    expect(saved).toHaveBeenCalledWith("u1", { accent: null, base: null, primary: "#2F6FDB" });
  });

  it("starts from the cached colours while the request is still running", async () => {
    session.mockReturnValue({ isLoading: false, profile: { userId: "u1" }, session: { user: { id: "u1" } }, supabase: {} } as never);
    cached.mockResolvedValue({ accent: null, base: null, primary: "#7A1F2B" });
    fetchTheme.mockReturnValue(new Promise(() => undefined));
    const seen: Array<typeof DEFAULT_COLORS> = [];

    renderProvider((colors) => seen.push(colors));

    await waitFor(() => expect(seen[seen.length - 1].primary[400]).toBe("#7A1F2B"));
  });

  it("falls back to the default theme when the request fails", async () => {
    session.mockReturnValue({ isLoading: false, profile: { userId: "u1" }, session: { user: { id: "u1" } }, supabase: {} } as never);
    fetchTheme.mockRejectedValue(new Error("offline"));
    const seen: Array<typeof DEFAULT_COLORS> = [];

    renderProvider((colors) => seen.push(colors));

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[seen.length - 1]).toBe(DEFAULT_COLORS);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/shop-theme-provider.test.ts`
Expected: FAIL (`Cannot find module .../ShopThemeProvider`).

- [ ] **Step 3: Implementar**

`src/features/shops/ShopThemeProvider.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { ThemeInput } from "../../lib/design/theme/derive";
import { AppThemeProvider } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { getShopTheme, readCachedTheme, writeCachedTheme } from "./theme";

// The current shop's colours (single-shop MVP). `isReady` is false only while a signed-in user has neither a cached
// theme nor an answer yet, so the root can keep its loading screen instead of flashing the default colours.
export function useShopTheme() {
  const { session, supabase } = useSupabaseSession();
  const userId = session?.user.id ?? null;
  const [cache, setCache] = useState<{ loaded: boolean; value: ThemeInput | null }>({ loaded: false, value: null });
  const query = useQuery({ enabled: Boolean(userId), queryFn: () => getShopTheme(supabase), queryKey: ["shop-theme", userId] });

  useEffect(() => {
    let active = true;

    setCache({ loaded: !userId, value: null });
    if (userId) {
      void readCachedTheme(userId).then((value) => {
        if (active) setCache({ loaded: true, value });
      });
    }

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (userId && query.data) void writeCachedTheme(userId, query.data.input);
  }, [query.data, userId]);

  const answered = query.isSuccess || query.isError;

  return {
    data: query.data,
    input: query.data ? query.data.input : answered ? null : cache.value,
    isReady: !userId || answered || (cache.loaded && cache.value !== null),
  };
}

export function ShopThemeProvider({ children }: PropsWithChildren) {
  const { input, isReady } = useShopTheme();

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AppThemeProvider input={input}>{children}</AppThemeProvider>;
}

const styles = StyleSheet.create({ loading: { alignItems: "center", flex: 1, justifyContent: "center" } });
```

`app/_layout.tsx` (`RootLayout`): trocar `<AppThemeProvider>` por `<ShopThemeProvider>` (importar de `../src/features/shops/ShopThemeProvider`; remover o import de `AppThemeProvider` do layout, pois só `useColors` continua usado ali):

```tsx
      <AppProviders>
        <ShopThemeProvider>
          <RootNavigator />
        </ShopThemeProvider>
      </AppProviders>
```

Atualizar `tests/unit/root-layout.test.ts` com `jest.mock("../../src/features/shops/ShopThemeProvider", () => ({ ShopThemeProvider: ({ children }: { children: unknown }) => children }))` junto dos outros mocks.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/shop-theme-provider.test.ts tests/unit/root-layout.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/shops/ShopThemeProvider.tsx app/_layout.tsx tests/unit/shop-theme-provider.test.ts tests/unit/root-layout.test.ts
git commit -m "feat(theme): apply the shop colours after sign-in with a cached start"
```

---

### Task 13: Textos (i18n) e rota da tela Aparência

**Files:**
- Modify: `src/i18n/locales/pt.ts`, `es.ts`, `en.ts`
- Modify: `src/lib/navigation/parents.ts`
- Modify: `app/(owner)/manage.tsx`
- Test: o teste de paridade de chaves existente (`grep -rln "locales" tests/unit | head`) cobre pt/es/en; rodar a suíte i18n.

- [ ] **Step 1: Adicionar as chaves nos três idiomas**

Em `owner.settings` (junto de `shopLink`), nova chave `appearanceLink`; e um bloco novo `owner.appearance`:

pt:
```ts
      appearanceLink: "Aparência do app",
```
```ts
    appearance: {
      accent: "Cor de destaque",
      accentHint: "Botões de ação (agendar, entrar, salvar). Vazio usa a cor principal.",
      adjusted: "Ajustamos levemente uma cor para o texto ficar legível.",
      base: "Cor de base",
      baseHint: "Tom dos fundos e do texto. As telas continuam claras.",
      hexLabel: "Código da cor",
      hexPlaceholder: "#RRGGBB",
      intro: "Escolha as cores do app do seu estabelecimento. Quem não escolhe usa o padrão Zenc.",
      invalidColor: "Use 6 dígitos, como #2F6FDB.",
      preview: { action: "Agendar", price: "R$ 65,00", selected: "Selecionado", tab: "Agenda", title: "Pré-visualização" },
      primary: "Cor principal",
      primaryHint: "Identidade: aba ativa, preços, links e itens selecionados.",
      reset: "Voltar ao padrão Zenc",
      resetBody: "As cores do seu estabelecimento voltam ao padrão Zenc.",
      resetCancel: "Cancelar",
      resetConfirm: "Voltar ao padrão",
      resetTitle: "Voltar ao padrão Zenc?",
      save: "Salvar cores",
      saveError: "Não foi possível salvar as cores.",
      saved: "Cores salvas.",
      title: "Aparência do app",
    },
```
es:
```ts
      appearanceLink: "Apariencia de la app",
```
```ts
    appearance: {
      accent: "Color de acento",
      accentHint: "Botones de acción (reservar, entrar, guardar). Vacío usa el color principal.",
      adjusted: "Ajustamos ligeramente un color para que el texto sea legible.",
      base: "Color base",
      baseHint: "Tono de los fondos y del texto. Las pantallas siguen siendo claras.",
      hexLabel: "Código del color",
      hexPlaceholder: "#RRGGBB",
      intro: "Elige los colores de la app de tu establecimiento. Quien no elige usa el estándar Zenc.",
      invalidColor: "Usa 6 dígitos, como #2F6FDB.",
      preview: { action: "Reservar", price: "R$ 65,00", selected: "Seleccionado", tab: "Agenda", title: "Vista previa" },
      primary: "Color principal",
      primaryHint: "Identidad: pestaña activa, precios, enlaces y elementos seleccionados.",
      reset: "Volver al estándar Zenc",
      resetBody: "Los colores de tu establecimiento vuelven al estándar Zenc.",
      resetCancel: "Cancelar",
      resetConfirm: "Volver al estándar",
      resetTitle: "¿Volver al estándar Zenc?",
      save: "Guardar colores",
      saveError: "No se pudieron guardar los colores.",
      saved: "Colores guardados.",
      title: "Apariencia de la app",
    },
```
en:
```ts
      appearanceLink: "App appearance",
```
```ts
    appearance: {
      accent: "Accent colour",
      accentHint: "Action buttons (book, sign in, save). Empty uses the primary colour.",
      adjusted: "We slightly adjusted a colour so the text stays readable.",
      base: "Base colour",
      baseHint: "Tint of the backgrounds and text. Screens stay light.",
      hexLabel: "Colour code",
      hexPlaceholder: "#RRGGBB",
      intro: "Pick the colours of your business's app. If you pick none, the Zenc default is used.",
      invalidColor: "Use 6 digits, like #2F6FDB.",
      preview: { action: "Book", price: "R$ 65,00", selected: "Selected", tab: "Agenda", title: "Preview" },
      primary: "Primary colour",
      primaryHint: "Identity: active tab, prices, links and selected items.",
      reset: "Back to the Zenc default",
      resetBody: "Your business colours go back to the Zenc default.",
      resetCancel: "Cancel",
      resetConfirm: "Back to default",
      resetTitle: "Back to the Zenc default?",
      save: "Save colours",
      saveError: "Could not save the colours.",
      saved: "Colours saved.",
      title: "App appearance",
    },
```
O bloco `appearance` entra dentro de `owner` (irmão de `shop`, `settings`...), respeitando a ordem alfabética que o arquivo já segue.

- [ ] **Step 2: Rota e entrada no hub**

`src/lib/navigation/parents.ts`: acrescentar, junto de `"/shop": "/manage",` → `"/appearance": "/manage",`.
`app/(owner)/manage.tsx`: no `MenuBlock` que contém `{ icon: Store, key: "shop", … }`, acrescentar logo depois:

```tsx
                { icon: Palette, key: "appearance", label: t("owner.settings.appearanceLink"), onPress: go("/appearance") },
```
e importar `Palette` de `lucide-react-native` junto de `Store`. Se existir teste do mapa de pais (`grep -rln "parents" tests/unit`), acrescentar a rota nele.

- [ ] **Step 3: Rodar**

Run: `npm run typecheck && npx jest --runInBand`
Expected: verde (o teste de paridade de i18n falha se faltar chave em algum idioma).

- [ ] **Step 4: Commit**

```bash
git add src/i18n src/lib/navigation "app/(owner)/manage.tsx" tests
git commit -m "feat(theme): appearance texts in pt/es/en and the owner hub entry"
```

---

### Task 14: Componentes `ColorField`, `ThemePreview` e a tela Aparência

**Files:**
- Create: `src/components/domain/ColorField.tsx`
- Create: `src/features/shops/ThemePreview.tsx`
- Create: `app/(owner)/appearance.tsx`
- Test: `tests/unit/color-field.test.ts`, `tests/unit/theme-preview.test.ts`

**Interfaces:**
- Consumes: `normalizeThemeColor`, `updateShopTheme` (Task 11), `useShopTheme` (Task 12), `ThemeScope`, `useTheme` (Task 5), `Button`, `Card`, `Input`, `Screen`, `ScreenHeader`, `Toast`, `ConfirmDialog`, `useBack`, `errorMessage`, `useSupabaseSession`.
- Produces:
  - `ColorField({ label, hint, value, onChange, presets, error, testID })`: `value` é a string digitada (hex ou vazio); cada amostra é um `Pressable` com `accessibilityLabel` = hex, `testID={`${testID}-swatch-${hex}`}`; campo `Input` com `testID={`${testID}-input`}`.
  - `ThemePreview({ input })`: `ThemeScope` com botão de ação, aba, preço, item selecionado e dia selecionado.

- [ ] **Step 1: Escrever os testes que falham**

`tests/unit/color-field.test.ts`:

```ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { ColorField } from "../../src/components/domain/ColorField";

const presets = ["#DB9A34", "#2F6FDB"] as const;

describe("ColorField", () => {
  it("picks a swatch by tapping it", () => {
    const onChange = jest.fn();
    const view = render(React.createElement(ColorField, { label: "Primary", onChange, presets, testID: "p", value: "" }));

    fireEvent.press(view.getByTestId("p-swatch-#2F6FDB"));

    expect(onChange).toHaveBeenCalledWith("#2F6FDB");
  });

  it("lets the owner type a code and reports it as typed", () => {
    const onChange = jest.fn();
    const view = render(React.createElement(ColorField, { label: "Primary", onChange, presets, testID: "p", value: "" }));

    fireEvent.changeText(view.getByTestId("p-input"), "#7a1f2b");

    expect(onChange).toHaveBeenCalledWith("#7a1f2b");
  });

  it("marks the selected swatch and shows an error", () => {
    const view = render(React.createElement(ColorField, { error: "Invalid", label: "Primary", onChange: jest.fn(), presets, testID: "p", value: "#2f6fdb" }));

    expect(view.getByTestId("p-swatch-#2F6FDB").props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByText("Invalid")).toBeTruthy();
  });
});
```

`tests/unit/theme-preview.test.ts`:

```ts
import React from "react";
import { render } from "@testing-library/react-native";

import { ThemePreview } from "../../src/features/shops/ThemePreview";

describe("ThemePreview", () => {
  it("renders the sample elements with the preview texts", () => {
    const view = render(React.createElement(ThemePreview, { input: { accent: null, base: null, primary: "#2F6FDB" } }));

    expect(view.getByTestId("theme-preview")).toBeTruthy();
    expect(view.getByText("owner.appearance.preview.action")).toBeTruthy();
    expect(view.getByText("owner.appearance.preview.selected")).toBeTruthy();
  });
});
```
(O mock de `react-i18next` do `jest.setup.ts` devolve a chave; se devolver o texto traduzido, usar o texto em inglês.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx jest --runInBand tests/unit/color-field.test.ts tests/unit/theme-preview.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `ColorField`**

`src/components/domain/ColorField.tsx`:

```tsx
import { Pressable, Text, View } from "react-native";

import { Input } from "../ui/Input";

export type ColorFieldProps = {
  error?: string;
  hint?: string;
  label: string;
  onChange: (value: string) => void;
  presets: readonly string[];
  testID: string;
  value: string;
};

// Swatches plus a hex field. The swatch colours are data (the choices on offer), so they are the one place a literal
// colour goes into a style.
export function ColorField({ error, hint, label, onChange, presets, testID, value }: ColorFieldProps) {
  const normalized = value.trim().replace(/^#?/, "#").toUpperCase();

  return (
    <View className="gap-2" testID={testID}>
      <Text className="font-sans-semibold text-base text-ink">{label}</Text>
      {hint ? <Text className="text-sm text-neutral-600">{hint}</Text> : null}
      <View className="flex-row flex-wrap gap-2">
        {presets.map((hex) => {
          const selected = normalized === hex;

          return (
            <Pressable
              accessibilityLabel={hex}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`h-11 w-11 rounded-full border-2 ${selected ? "border-ink" : "border-neutral-200"}`}
              key={hex}
              onPress={() => onChange(hex)}
              style={{ backgroundColor: hex }}
              testID={`${testID}-swatch-${hex}`}
            />
          );
        })}
      </View>
      <Input
        autoCapitalize="characters"
        autoCorrect={false}
        error={error}
        label={label}
        maxLength={7}
        onChangeText={onChange}
        placeholder="#RRGGBB"
        testID={`${testID}-input`}
        value={value}
      />
    </View>
  );
}
```

(O `label` repetido no `Input` é exigido pela API; se o `Input` mostrar o rótulo visível duplicado, passar um rótulo curto via prop `hexLabel` e usar `t("owner.appearance.hexLabel")` na tela — ajustar ao ver na tela, sem mudar a API pública do `ColorField` além de acrescentar `inputLabel?: string`.)

- [ ] **Step 4: Implementar `ThemePreview`**

`src/features/shops/ThemePreview.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import type { ThemeInput } from "../../lib/design/theme/derive";
import { ThemeScope } from "../../lib/design/theme/ThemeProvider";

// A small sample of the app painted with the draft colours; only this subtree changes while the owner chooses.
export function ThemePreview({ input }: { input: ThemeInput }) {
  const { t } = useTranslation();

  return (
    <ThemeScope className="gap-3 rounded-[20px] border border-neutral-200 bg-canvas p-4" input={input}>
      <View className="gap-3" testID="theme-preview">
        <Text className="font-display-bold text-xl text-ink">{t("owner.appearance.preview.title")}</Text>
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-sm text-primary-600">{t("owner.appearance.preview.tab")}</Text>
          <Text className="font-display-bold text-xl text-primary-600">{t("owner.appearance.preview.price")}</Text>
        </View>
        <View className="rounded-[20px] border-[1.5px] border-primary-400 bg-primary-50 p-3">
          <Text className="font-sans-semibold text-base text-ink">{t("owner.appearance.preview.selected")}</Text>
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-ink">
          <Text className="font-sans-semibold text-base text-white">12</Text>
        </View>
        <Button label={t("owner.appearance.preview.action")} onPress={() => undefined} />
      </View>
    </ThemeScope>
  );
}
```

- [ ] **Step 5: Implementar a tela**

`app/(owner)/appearance.tsx` (segue o padrão de `shop.tsx`: `Screen` + `KeyboardAwareScrollView` + `ScreenHeader`):

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ColorField } from "../../src/components/domain/ColorField";
import { ConfirmDialog } from "../../src/components/domain/ConfirmDialog";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { ThemePreview } from "../../src/features/shops/ThemePreview";
import { useShopTheme } from "../../src/features/shops/ShopThemeProvider";
import { normalizeThemeColor, updateShopTheme } from "../../src/features/shops/theme";
import type { ShopThemeValues } from "../../src/features/shops/theme";
import { errorMessage } from "../../src/i18n/errors";
import { deriveTheme } from "../../src/lib/design/theme/derive";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Offered colours: Âmbar (default), Terracota, Vinho, Rosa, Violeta, Azul, Turquesa, Verde, Grafite, Preto.
const ACTION_PRESETS = ["#DB9A34", "#C2593A", "#7A1F2B", "#D9588A", "#7C5CE0", "#2F6FDB", "#1BA39C", "#2F9E5B", "#3D3327", "#171412"] as const;
// Quente (default), Neutro, Frio, Rosado, Verde claro, Lavanda.
const BASE_PRESETS = ["#F7F3EE", "#F5F5F5", "#EEF3F8", "#F8EFF1", "#EFF5F0", "#F3F0F8"] as const;

type Draft = { accent: string; base: string; primary: string };

const toDraft = (values: ShopThemeValues | undefined): Draft => ({ accent: values?.accent ?? "", base: values?.base ?? "", primary: values?.primary ?? "" });

export default function OwnerAppearanceScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { data } = useShopTheme();
  const [draft, setDraft] = useState<Draft>(toDraft(undefined));
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (data) setDraft(toDraft(data.input));
  }, [data?.shopId]); // eslint-disable-line react-hooks/exhaustive-deps -- load the saved colours once per shop, then the owner edits freely

  const parsed = useMemo(
    () => ({ accent: normalizeThemeColor(draft.accent), base: normalizeThemeColor(draft.base), primary: normalizeThemeColor(draft.primary) }),
    [draft],
  );
  const valid = parsed.accent.ok && parsed.base.ok && parsed.primary.ok;
  const values: ShopThemeValues = {
    accent: parsed.accent.ok ? parsed.accent.value : null,
    base: parsed.base.ok ? parsed.base.value : null,
    primary: parsed.primary.ok ? parsed.primary.value : null,
  };
  const theme = useMemo(() => deriveTheme(values), [values.accent, values.base, values.primary]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (next: ShopThemeValues) => updateShopTheme(supabase, data!.shopId, next),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.appearance.saveError")), variant: "error" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shop-theme"] });
      setFeedback({ message: t("owner.appearance.saved"), variant: "success" });
    },
  });
  const error = (result: { ok: boolean }) => (result.ok ? undefined : t("owner.appearance.invalidColor"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.appearance.title")} />
            <Text className="text-base text-neutral-600">{t("owner.appearance.intro")}</Text>
            <Card>
              <View className="gap-5">
                <ColorField
                  error={error(parsed.primary)}
                  hint={t("owner.appearance.primaryHint")}
                  label={t("owner.appearance.primary")}
                  onChange={(primary) => setDraft((current) => ({ ...current, primary }))}
                  presets={ACTION_PRESETS}
                  testID="appearance-primary"
                  value={draft.primary}
                />
                <ColorField
                  error={error(parsed.accent)}
                  hint={t("owner.appearance.accentHint")}
                  label={t("owner.appearance.accent")}
                  onChange={(accent) => setDraft((current) => ({ ...current, accent }))}
                  presets={ACTION_PRESETS}
                  testID="appearance-accent"
                  value={draft.accent}
                />
                <ColorField
                  error={error(parsed.base)}
                  hint={t("owner.appearance.baseHint")}
                  label={t("owner.appearance.base")}
                  onChange={(base) => setDraft((current) => ({ ...current, base }))}
                  presets={BASE_PRESETS}
                  testID="appearance-base"
                  value={draft.base}
                />
              </View>
            </Card>
            <ThemePreview input={values} />
            {theme.adjusted.primary || theme.adjusted.accent ? (
              <Text className="text-sm text-neutral-600" testID="appearance-adjusted">{t("owner.appearance.adjusted")}</Text>
            ) : null}
            <Button disabled={!valid || !data || save.isPending} label={t("owner.appearance.save")} onPress={() => save.mutate(values)} testID="appearance-save" />
            <Button label={t("owner.appearance.reset")} onPress={() => setConfirmingReset(true)} testID="appearance-reset" variant="ghost" />
          </View>
        </View>
      </KeyboardAwareScrollView>
      <ConfirmDialog
        body={t("owner.appearance.resetBody")}
        cancelLabel={t("owner.appearance.resetCancel")}
        confirmLabel={t("owner.appearance.resetConfirm")}
        confirmVariant="dark"
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => {
          setConfirmingReset(false);
          setDraft(toDraft(undefined));
          save.mutate({ accent: null, base: null, primary: null });
        }}
        title={t("owner.appearance.resetTitle")}
        visible={confirmingReset}
      />
      <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "success"} visible={Boolean(feedback)} />
    </Screen>
  );
}
```

(Se `Card`, `Toast` ou `Button` tiverem props diferentes das usadas acima, o typecheck mostra; ajustar ao que o componente realmente aceita, seguindo `app/(owner)/shop.tsx`, sem mudar a lógica da tela.)

- [ ] **Step 6: Rodar e ver passar**

Run: `npx jest --runInBand tests/unit/color-field.test.ts tests/unit/theme-preview.test.ts && npm run typecheck && npx eslint app src tests scripts`
Expected: PASS e limpo.

- [ ] **Step 7: Commit**

```bash
git add src/components/domain/ColorField.tsx src/features/shops/ThemePreview.tsx "app/(owner)/appearance.tsx" tests/unit/color-field.test.ts tests/unit/theme-preview.test.ts
git commit -m "feat(theme): owner Appearance screen with swatches, hex field and live preview"
```

---

### Task 15: e2e da tela Aparência (inclui `Modal` na web)

**Files:**
- Create: `tests/e2e/owner-appearance.web.spec.ts`

**Interfaces:**
- Consumes: testIDs `appearance-primary-input`, `appearance-save`, `appearance-reset`, `theme-preview`; `ConfirmDialog` (um `Modal`).

- [ ] **Step 1: Escrever o teste**

Seguir o padrão de `tests/e2e/owner-shop.web.spec.ts` (`signInAsOwner`, `json` de `./customer-helpers`). O mock de `/shops` guarda o tema num objeto mutável para refletir o `PATCH`:

```ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { json } from "./customer-helpers";

const ownerId = "55555555-5555-4555-8555-555555555555";
const shop = "11111111-1111-4111-8111-111111111111";

async function signInAsOwner(page: Page) {
  await page.addInitScript(({ id }) => {
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "none" })).replace(/=+$/, "");
    const token = `${header}.${btoa(JSON.stringify({ exp: now + 3600, sub: id }))}.`;
    const session = JSON.stringify({ access_token: token, expires_at: now + 3600, expires_in: 3600, refresh_token: "e2e-refresh-token", token_type: "bearer", user: { id } });
    localStorage.setItem("sb-example-auth-token", session);
    localStorage.setItem("sb-127-auth-token", session);
  }, { id: ownerId });
}

async function mockRest(page: Page, theme: { theme_accent: string | null; theme_base: string | null; theme_primary: string | null }, patches: unknown[]) {
  await page.route("**/rest/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/rpc/get_current_profile")) return json(route, [{ full_name: "Owner", role: "owner", user_id: ownerId }]);
    if (path.endsWith("/shops") && method === "GET") return json(route, [{ address: null, id: shop, name: "Shop", phone: null, whatsapp: null, ...theme }]);
    if (path.endsWith("/shops") && method === "PATCH") {
      const body = route.request().postDataJSON() as typeof theme;
      patches.push(body);
      Object.assign(theme, body);

      return json(route, null);
    }
    await route.abort();
  });
}

const background = (page: Page, testId: string) => page.getByTestId(testId).evaluate((node) => getComputedStyle(node).backgroundColor);

test("the owner picks a colour, sees it in the preview, saves it and the whole app, pop-ups included, follows", async ({ page }) => {
  const theme = { theme_accent: null, theme_base: null, theme_primary: null };
  const patches: unknown[] = [];

  await signInAsOwner(page);
  await mockRest(page, theme, patches);
  await page.goto("/appearance");

  const save = page.getByRole("button", { name: "Save colours" });

  await expect(save).toBeVisible();
  await expect.poll(() => save.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(219, 154, 52)");

  await page.getByTestId("appearance-primary-input").fill("#2F6FDB");

  // The preview button follows the draft; the Save button (outside the preview) does not change until saving.
  const previewAction = page.getByTestId("theme-preview").getByRole("button", { name: "Book" });

  await expect.poll(() => previewAction.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(47, 111, 219)");
  await expect.poll(() => save.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(219, 154, 52)");

  await save.click();

  expect(patches).toEqual([{ theme_accent: null, theme_base: null, theme_primary: "#2F6FDB" }]);
  await expect.poll(() => save.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(47, 111, 219)");

  // The confirmation pop-up is a Modal (portalled to document.body): it must carry the shop colours too.
  await page.getByRole("button", { name: "Back to the Zenc default" }).click();
  const confirm = page.getByRole("button", { name: "Back to default" });

  await expect(confirm).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Back to the Zenc default" }).click();
  await page.getByRole("button", { name: "Back to default" }).click();

  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toEqual({ theme_accent: null, theme_base: null, theme_primary: null });
  await expect.poll(() => save.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgb(219, 154, 52)");
});

test("the screen stays usable when the saved colour is not a valid code", async ({ page }) => {
  const theme = { theme_accent: null, theme_base: null, theme_primary: null };

  await signInAsOwner(page);
  await mockRest(page, theme, []);
  await page.goto("/appearance");
  await page.getByTestId("appearance-primary-input").fill("blue");

  await expect(page.getByText("Use 6 digits, like #2F6FDB.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save colours" })).toBeDisabled();
});
```

Observação: o `ConfirmDialog` mostra o botão de confirmar com `variant="dark"` (`bg-ink`, não accent): para provar o `Modal` herdando o tema, a verificação certa é a cor de um elemento do pop-up que usa token temático. Se o botão `dark` (ink) não mudar com a cor principal, trocar a asserção do pop-up por uma que dependa de `primary`/`accent`/`base`: com um tema de **base** customizado (`#EEF3F8`), o fundo do cartão do pop-up (`bg-surface`) muda; usar essa checagem no pop-up e manter a de botão no resto da tela.

- [ ] **Step 2: Rodar**

Exportar e servir como na Task 6 (script com `trap`; `.env.local` fora e de volta) e rodar só este spec.
Expected: PASS. Falha de cor no pop-up = `vars` na web não alcança o `Modal`: parar e rever o provider (é o risco central do spec).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/owner-appearance.web.spec.ts
git commit -m "test(theme): e2e for choosing, previewing, saving and resetting the shop colours"
```

---

### Task 16: Verificação final da PARTE B, docs e PR B

- [ ] **Step 1: Banco limpo**

Run: `npx supabase db reset > /dev/null 2>&1; npx supabase test db 2>&1 | grep -E "^Files=|^Result"` e depois recriar as contas de dev (`dev-owner.sql`, `dev-professional.sql`).
Expected: 45 arquivos, PASS.

- [ ] **Step 2: Verificação completa**

Run: `npm run typecheck && npx eslint app src tests scripts && npm test -- --runInBand && npm run test:e2e:runner`
Expected: verde.
e2e completo (script do scratchpad): verde exceto as duas falhas conhecidas.

- [ ] **Step 3: Conferência visual no navegador**

Com o bundle servido e os mocks do e2e, abrir `/appearance` e capturar tela + CSS computado: padrão (âmbar) e com `#2F6FDB`; conferir que cliente, dono e profissional continuam estilizados com o tema aplicado (`className` só em elementos RN simples).

- [ ] **Step 4: Docs**

Atualizar `docs/decisions/016-shop-theme.md` (seção "Consequences": tela Aparência, colunas, cache por usuário) e `docs/project-status.md` (nota datada). Memória do projeto: `project_shop_theme.md` + linha no `MEMORY.md` (estado dos PRs, risco do `vars()` no celular, ajustes ao spec).

- [ ] **Step 5: Push e PR B**

```bash
git add docs
git commit -m "docs: shop theme decision and status"
git push -u origin feat-shop-theme
gh pr create --base feat-theme-tokens --head feat-shop-theme --title "feat(theme): per-shop colours and the owner Appearance screen" --body-file <arquivo>
```
A base é `feat-theme-tokens` (PR A); quando o A entrar em `main`, retargetar o B para `main`. Corpo: resumo, verificação com números reais, riscos (`vars()` no nativo; tema só depois do login; loja única), e a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Depois `get_status`/`bind_pr` e Auto-fix.
