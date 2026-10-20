# Input Masks, Locale Dates and Back Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Date/time/phone/CPF fields show visual masks while typing; dates follow the language; back buttons return to the previous screen.

**Architecture:** Pure mask functions in `src/lib/input-masks.ts` (unit-tested), thin `DateInput`/`TimeInput` wrappers over `Input` that keep ISO / `HH:MM` as the stored value. Back navigation: expo-router `Tabs` defaults to `backBehavior: "firstRoute"`, so hidden screens go back to the first tab (agenda); set `"history"`.

**Tech Stack:** Expo Router, React Native, NativeWind, i18next, Jest (`tests/unit/*.test.ts` only), Playwright web e2e.

**Spec:** `docs/superpowers/plans/2026-10-20-ux-overhaul-index.md` (decisions table).

## Global Constraints
- Stored values never change format: dates `YYYY-MM-DD`, times `HH:MM`, phone as today's `formatPhone` output.
- Display: `pt`/`es` → `DD/MM/YYYY`; `en` → `YYYY-MM-DD`.
- Jest only matches `tests/**/*.test.ts` (no component tests); verify components in the browser (screenshot + computed CSS).
- Branch: `feat-input-masks-nav-stack` from `main`. Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Mask functions

**Files:** Create `src/lib/input-masks.ts`; Test `tests/unit/input-masks.test.ts`

**Interfaces — Produces:**
`formatDateInput(input: string, language: Language): string`, `parseDateInput(display: string, language: Language): string | null` (ISO or null if incomplete/invalid), `formatTimeInput(input: string): string`, `formatCpf(input: string): string`.

- [ ] **Step 1: failing test**

```ts
import { formatCpf, formatDateInput, formatTimeInput, parseDateInput } from "../../src/lib/input-masks";

describe("formatDateInput", () => {
  it("masks pt/es as DD/MM/YYYY", () => {
    expect(formatDateInput("02102026", "pt")).toBe("02/10/2026");
    expect(formatDateInput("021", "es")).toBe("02/1");
    expect(formatDateInput("02/10/20269", "pt")).toBe("02/10/2026");
  });
  it("masks en as YYYY-MM-DD", () => {
    expect(formatDateInput("20261002", "en")).toBe("2026-10-02");
    expect(formatDateInput("20261", "en")).toBe("2026-1");
    expect(formatDateInput("", "en")).toBe("");
  });
});

describe("parseDateInput", () => {
  it("returns ISO for complete valid dates", () => {
    expect(parseDateInput("02/10/2026", "pt")).toBe("2026-10-02");
    expect(parseDateInput("2026-10-02", "en")).toBe("2026-10-02");
  });
  it("returns null when incomplete or not a real date", () => {
    expect(parseDateInput("02/10/202", "pt")).toBeNull();
    expect(parseDateInput("31/02/2026", "pt")).toBeNull();
  });
});

describe("formatTimeInput", () => {
  it("masks HH:MM", () => {
    expect(formatTimeInput("1")).toBe("1");
    expect(formatTimeInput("123")).toBe("12:3");
    expect(formatTimeInput("12:30")).toBe("12:30");
    expect(formatTimeInput("123099")).toBe("12:30");
  });
});

describe("formatCpf", () => {
  it("masks 000.000.000-00", () => {
    expect(formatCpf("12345678901")).toBe("123.456.789-01");
    expect(formatCpf("1234")).toBe("123.4");
    expect(formatCpf("123456789012345")).toBe("123.456.789-01");
  });
});
```

- [ ] **Step 2:** `npx jest tests/unit/input-masks.test.ts` → FAIL (module missing).

- [ ] **Step 3: implement**

```ts
import type { Language } from "../i18n/language";

const digits = (text: string) => text.replace(/\D/g, "");

export function formatDateInput(input: string, language: Language) {
  const d = digits(input).slice(0, 8);
  const parts = language === "en" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)];

  return parts.filter(Boolean).join(language === "en" ? "-" : "/");
}

export function parseDateInput(display: string, language: Language) {
  const d = digits(display);
  if (d.length !== 8) return null;

  const [year, month, day] = language === "en" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(4, 8), d.slice(2, 4), d.slice(0, 2)];
  const iso = `${year}-${month}-${day}`;

  return new Date(`${iso}T12:00:00Z`).toISOString().slice(0, 10) === iso ? iso : null;
}

export function formatTimeInput(input: string) {
  const d = digits(input).slice(0, 4);

  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

export function formatCpf(input: string) {
  const d = digits(input).slice(0, 11);
  const groups = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean);
  const head = groups.join(".");

  return d.length > 9 ? `${head}-${d.slice(9)}` : head;
}
```

Note: `new Date("2026-02-31T12:00:00Z")` is an Invalid Date in some engines and throws on `toISOString`; wrap with `Number.isNaN(date.getTime())` guard if the test for `31/02/2026` throws.

- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** `git add src/lib/input-masks.ts tests/unit/input-masks.test.ts && git commit -m "feat: input mask helpers"`

---

### Task 2: Locale date format

**Files:** Modify `src/lib/i18n/format.ts:25-33`; Modify `tests/unit/format.test.ts:22-27`

- [ ] **Step 1:** change test expectation `en` to `"2026-10-02"` (pt/es stay `02/10/2026`). Run `npx jest tests/unit/format.test.ts` → FAIL on en.
- [ ] **Step 2:** replace `formatDateNumeric` body:

```ts
export function formatDateNumeric(localDate: string, language: Language) {
  const [year, month, day] = localDate.split("-");

  return language === "en" ? localDate : `${day}/${month}/${year}`;
}
```
- [ ] **Step 3:** run → PASS; `npm run typecheck`.
- [ ] **Step 4:** commit `fix: date display follows language`.

---

### Task 3: DateInput / TimeInput components

**Files:** Create `src/components/ui/MaskedInputs.tsx`; Modify `src/components/ui/index.ts` (export)

**Interfaces — Consumes:** Task 1 functions, `formatDateNumeric`, `useLanguage()` from `src/i18n/use-language`, `Input`/`InputProps`.
**Produces:** `<DateInput value={iso} onChangeValue={(iso: string) => void} …InputProps>` (emits `""` until complete+valid), `<TimeInput value="HH:MM" onChangeValue …>`.

- [ ] **Step 1:** implement

```tsx
import { useState } from "react";

import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";
import { formatDateInput, formatTimeInput, parseDateInput } from "../../lib/input-masks";
import { Input } from "./Input";
import type { InputProps } from "./Input";

type MaskedProps = Omit<InputProps, "onChangeText" | "keyboardType"> & { onChangeValue: (value: string) => void };

export function DateInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const language = useLanguage();
  const [draft, setDraft] = useState("");
  const hint = language === "en" ? "YYYY-MM-DD" : "DD/MM/AAAA";

  return (
    <Input
      {...rest}
      keyboardType="number-pad"
      onChangeText={(text) => {
        const masked = formatDateInput(text, language);
        setDraft(masked);
        onChangeValue(parseDateInput(masked, language) ?? "");
      }}
      placeholder={placeholder ?? hint}
      value={value ? formatDateNumeric(value, language) : draft}
    />
  );
}

export function TimeInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  return <Input {...rest} keyboardType="number-pad" onChangeText={(text) => onChangeValue(formatTimeInput(text))} placeholder={placeholder ?? "HH:MM"} value={value} />;
}
```
Known wrinkle: after a complete date the user deletes one char → display is the formatted ISO minus one char → `onChangeText` receives 7 digits → draft set, emits `""` → shows draft. Correct.

- [ ] **Step 2:** `npm run typecheck && npm run lint` pass.
- [ ] **Step 3:** commit `feat: DateInput and TimeInput`.

---

### Task 4: Wire into screens

Replace `Input` with `DateInput`/`TimeInput` (prop `onChangeText` → `onChangeValue`; state stays ISO/HH:MM). Remove `placeholder={TIME_HINT}` where redundant.

- Dates: `app/(owner)/agenda.tsx:106`, `app/(owner)/appointment-form.tsx:152`, `app/(owner)/schedule.tsx:166`, `app/(owner)/revenue.tsx:277`, `app/(owner)/monthly-customers.tsx:184,198`.
- Times: `app/(owner)/shop.tsx:124-125`, `app/(owner)/schedule.tsx:147-148,179-180`, `app/(owner)/monthly-customers.tsx:188`, `app/(barber)/my-agenda.tsx:390-391`.
- Phone: `app/(owner)/customers.tsx:94` → `onChangeText={(v) => setPhone(formatPhone(v))}` (import from `src/features/account/phone`).
- CPF: `formatCpf` has no consumer yet (no CPF field exists) — do not wire.
- Label text: `src/i18n/locales/{en,es,pt}.ts` `common.localDate` currently "Local date (YYYY-MM-DD)" → drop the format suffix in all three (the placeholder now carries the hint). Check `tests/e2e` for assertions on that label.

- [ ] **Step 1:** make the edits file by file; after each: `npm run typecheck`.
- [ ] **Step 2:** `npx jest` and fix e2e selectors that typed ISO into date fields in pt locale (`tests/e2e/owner-*.web.spec.ts`; Playwright default locale is en so ISO typing still works).
- [ ] **Step 3:** also render read-only dates through `formatDateNumeric`: `app/(owner)/agenda.tsx` card line `{startsAt.localDate} {startsAt.localTime}`; grep `rg "localDate\}" app` for others.
- [ ] **Step 4:** browser check (web, pt and en): type `02102026` → `02/10/2026`; screenshot + `getComputedStyle` of the field. Per memory *verify-ui-in-browser*.
- [ ] **Step 5:** commit `feat: apply masks to date/time/phone fields`.

---

### Task 5: Back stack

**Files:** Modify `app/(owner)/_layout.tsx`, `app/(barber)/_layout.tsx`; Test `tests/e2e/owner-shell.web.spec.ts`

- [ ] **Step 1 (failing e2e):** in `owner-shell.web.spec.ts` add: sign in as owner, open `/manage`, click Barbers, click header back → `expect(page).toHaveURL(/\/manage/)`. Run via `npm run test:e2e:web` (move `.env.local` aside per memory). Expected FAIL: lands on `/agenda`.
- [ ] **Step 2:** add `backBehavior="history"` to `<Tabs …>` in owner and barber layouts (customer uses `TopTabs`; add the same prop if the e2e audit in step 4 shows the issue there).
- [ ] **Step 3:** run e2e → PASS.
- [ ] **Step 4 (app-wide audit):** for each role, from every hidden/nested screen press back and assert previous screen: owner (barbers, services, customers, monthly-customers, schedule, shop, appointment-form, recurrence-conflicts, language), barber (my-profile/*, clients/[id], move-appointment), customer (me/*, reschedule, book/* steps). Fix any that fail: replace ad-hoc `const back = () => router.canGoBack() ? …` in the 8 owner files with a shared `useBack(fallback)`.
- [ ] **Step 5:** extend `src/lib/navigation/use-back.ts` to `useBack(fallback = "/profile")`; swap the 8 owner copies (`/manage`, `/agenda`, `/monthly-customers` fallbacks kept).
- [ ] **Step 6:** `npm run typecheck && npm run lint && npx jest`; commit `fix: back navigation uses history`.

---

### Task 6: Review and PR
- [ ] Run `/code-review`, fix findings; `git push -u origin feat-input-masks-nav-stack`; open PR via `gh api` REST (memory: GraphQL fails here).
