# Month Calendar for Book and Reschedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontal day carousel on the customer "Agendar" (book) date step and on the reschedule screen with a month grid (weekday columns, week rows, month navigation), allowing bookings up to 30 days ahead.

**Architecture:** A pure helper module builds the month grid and decides which dates are bookable. A new presentational `MonthCalendar` component owns only the displayed-month state and calls `onSelectDate`. The two screens swap `CalendarStrip` for `MonthCalendar`; `CalendarStrip` stays for the Agenda tab.

**Tech Stack:** Expo Router / React Native + NativeWind, `lucide-react-native` icons, `Intl.DateTimeFormat`, i18next, Jest + RNTL, Playwright.

**Spec:** No spec file (bounded change). The design was approved in chat on 2026-09-28 and is summarised under "Global Constraints".

## Global Constraints

- Scope: `app/(customer)/book/date.tsx` and `app/(customer)/reschedule.tsx` only. The Agenda tab (`app/(customer)/appointments.tsx`) keeps `CalendarStrip`.
- Grid: 7 columns Sunday to Saturday, weeks as rows, month title, previous/next month buttons. No navigation to months before the current one.
- Bookable window: today through today + 30 days, in the shop timezone (`America/Sao_Paulo`). Other days are shown dimmed and are not pressable.
- Default selected date is today.
- All text goes through i18n (`pt`, `en`, `es`); the guard test `tests/unit/no-hardcoded-text.test.ts` must stay green. Month and weekday names come from `Intl.DateTimeFormat`.
- Colours and icons follow the existing design tokens (`src/lib/design/colors.ts`, `lucide-react-native`). `className` only on plain RN elements.
- TDD: test first, watch it fail, then implement.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

---

### Task 1: Month grid helpers

**Files:**
- Modify: `src/lib/dates/calendar-strip-days.ts` (export `addLocalDays`)
- Create: `src/lib/dates/month-calendar.ts`
- Test: `tests/unit/month-calendar.test.ts`

**Interfaces:**
- Produces:
  - `BOOKING_DAYS_AHEAD = 30`
  - `type MonthGrid = { label: string; weekdayLabels: string[]; weeks: (string | null)[][] }` (dates are `YYYY-MM-DD`, `null` pads the first and last week)
  - `addMonths(month: string, delta: number): string` (`"YYYY-MM"` in, `"YYYY-MM"` out)
  - `isDateBookable(date: string, today: string, maxDaysAhead?: number): boolean`
  - `buildMonthGrid(month: string, language: Language): MonthGrid`
  - `addLocalDays(localDate: string, days: number): string` (now exported)

- [ ] **Step 1: Write the failing test** in `tests/unit/month-calendar.test.ts`

```ts
import {
  BOOKING_DAYS_AHEAD,
  addMonths,
  buildMonthGrid,
  isDateBookable,
} from "../../src/lib/dates/month-calendar";

describe("addMonths", () => {
  it.each([
    ["2026-09", 1, "2026-10"],
    ["2026-12", 1, "2027-01"],
    ["2026-01", -1, "2025-12"],
    ["2026-09", 0, "2026-09"],
  ])("%s %p -> %s", (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected);
  });
});

describe("isDateBookable", () => {
  const today = "2026-09-28";

  it("uses a 30 day window", () => {
    expect(BOOKING_DAYS_AHEAD).toBe(30);
  });

  it.each([
    ["2026-09-27", false],
    ["2026-09-28", true],
    ["2026-10-28", true],
    ["2026-10-29", false],
  ])("%s -> %p", (date, expected) => {
    expect(isDateBookable(date, today)).toBe(expected);
  });

  it("honours a custom window", () => {
    expect(isDateBookable("2026-09-30", today, 1)).toBe(false);
    expect(isDateBookable("2026-09-29", today, 1)).toBe(true);
  });
});

describe("buildMonthGrid", () => {
  it("pads the first and last week (September 2026 starts on a Tuesday)", () => {
    const { weeks } = buildMonthGrid("2026-09", "en");

    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(weeks[4]).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", null, null, null]);
  });

  it("fits February 2026 (Sunday to Saturday, 28 days) in exactly four full rows", () => {
    const { weeks } = buildMonthGrid("2026-02", "en");

    expect(weeks).toHaveLength(4);
    expect(weeks.flat().every((cell) => cell !== null)).toBe(true);
    expect(weeks[3][6]).toBe("2026-02-28");
  });

  it("labels the month and the weekday columns in the requested language", () => {
    expect(buildMonthGrid("2026-09", "en").label).toBe("September 2026");
    expect(buildMonthGrid("2026-09", "pt").label).toBe("Setembro de 2026");
    expect(buildMonthGrid("2026-09", "es").label).toBe("Septiembre de 2026");
    expect(buildMonthGrid("2026-09", "en").weekdayLabels).toEqual(["S", "M", "T", "W", "T", "F", "S"]);
    expect(buildMonthGrid("2026-09", "pt").weekdayLabels[0]).toBe("D");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest tests/unit/month-calendar.test.ts`
Expected: FAIL, `Cannot find module '../../src/lib/dates/month-calendar'`.

- [ ] **Step 3: Implement.** In `src/lib/dates/calendar-strip-days.ts` change `function addLocalDays` to `export function addLocalDays`. Then create `src/lib/dates/month-calendar.ts`:

```ts
import type { Language } from "../../i18n/language";
import { addLocalDays } from "./calendar-strip-days";

export const BOOKING_DAYS_AHEAD = 30;

const LOCALE: Record<Language, string> = { en: "en-US", es: "es-ES", pt: "pt-BR" };

export type MonthGrid = { label: string; weekdayLabels: string[]; weeks: (string | null)[][] };

export function addMonths(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;

  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function isDateBookable(date: string, today: string, maxDaysAhead = BOOKING_DAYS_AHEAD) {
  return date >= today && date <= addLocalDays(today, maxDaysAhead);
}

export function buildMonthGrid(month: string, language: Language): MonthGrid {
  const first = new Date(`${month}-01T12:00:00Z`);
  const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null);

  for (let day = 1; day <= daysInMonth; day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  const weekday = new Intl.DateTimeFormat(LOCALE[language], { timeZone: "UTC", weekday: "narrow" });
  // 2026-08-30 is a Sunday, so seven consecutive days from it give the Sunday-first columns.
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekday.format(new Date(Date.UTC(2026, 7, 30 + index, 12))));
  const label = new Intl.DateTimeFormat(LOCALE[language], { month: "long", timeZone: "UTC", year: "numeric" }).format(first);

  return { label: label.charAt(0).toUpperCase() + label.slice(1), weekdayLabels, weeks };
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npx jest tests/unit/month-calendar.test.ts tests/unit/calendar-strip-days.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates tests/unit/month-calendar.test.ts
git commit -m "feat(calendar): month grid and bookable-window helpers"
```

---

### Task 2: MonthCalendar component and navigation labels

**Files:**
- Modify: `src/i18n/locales/{en,pt,es}.ts` (`common.previousMonth`, `common.nextMonth`)
- Create: `src/components/domain/MonthCalendar.tsx`
- Modify: `src/components/domain/index.ts` (export)
- Test: `tests/unit/month-calendar-component.test.ts`

**Interfaces:**
- Consumes: `addMonths`, `buildMonthGrid`, `isDateBookable`, `BOOKING_DAYS_AHEAD`, `addLocalDays` from Task 1; `formatDateLabel` from `src/lib/i18n/format.ts`; `useLanguage()`.
- Produces: `MonthCalendar({ maxDaysAhead?, onSelectDate, selectedDate, today, testID? })`. Test ids: `month-calendar-prev`, `month-calendar-next`, `month-calendar-title`, `month-calendar-day-<YYYY-MM-DD>`.

- [ ] **Step 1: Write the failing test** in `tests/unit/month-calendar-component.test.ts`

```ts
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { MonthCalendar } from "../../src/components/domain/MonthCalendar";

// today = Mon 2026-09-28, so the bookable window ends on 2026-10-28.
function renderCalendar(onSelectDate = jest.fn(), selectedDate = "2026-09-28") {
  return render(React.createElement(MonthCalendar, { onSelectDate, selectedDate, today: "2026-09-28" }));
}

describe("MonthCalendar", () => {
  it("opens on the month of today with weekday columns", async () => {
    const view = await renderCalendar();

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
    expect(view.getByTestId("month-calendar-day-2026-09-30")).toBeTruthy();
    expect(view.queryByTestId("month-calendar-day-2026-10-01")).toBeNull();
  });

  it("selects a bookable day", async () => {
    const onSelectDate = jest.fn();
    const view = await renderCalendar(onSelectDate);

    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-30"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-30");
  });

  it("does not let a past day be selected", async () => {
    const onSelectDate = jest.fn();
    const view = await renderCalendar(onSelectDate);

    expect(view.getByTestId("month-calendar-day-2026-09-27")).toBeDisabled();
    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-27"));

    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("cannot go before the current month", async () => {
    const view = await renderCalendar();

    expect(view.getByTestId("month-calendar-prev")).toBeDisabled();
  });

  it("moves to the next month, dims days past the window, and stops there", async () => {
    const view = await renderCalendar();

    await fireEvent.press(view.getByTestId("month-calendar-next"));

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
    expect(view.getByTestId("month-calendar-day-2026-10-28")).not.toBeDisabled();
    expect(view.getByTestId("month-calendar-day-2026-10-29")).toBeDisabled();
    expect(view.getByTestId("month-calendar-next")).toBeDisabled();
    expect(view.getByTestId("month-calendar-prev")).not.toBeDisabled();

    await fireEvent.press(view.getByTestId("month-calendar-prev"));

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("marks the selected day for assistive technology", async () => {
    const view = await renderCalendar(jest.fn(), "2026-09-30");

    expect(view.getByTestId("month-calendar-day-2026-09-30").props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByTestId("month-calendar-day-2026-09-29").props.accessibilityState).toMatchObject({ selected: false });
  });

  it("labels days and month buttons in the device language", async () => {
    const { default: i18n } = await import("../../src/i18n");

    await i18n.changeLanguage("pt");
    try {
      const view = await renderCalendar();

      expect(view.getByTestId("month-calendar-title")).toHaveTextContent("Setembro de 2026");
      expect(view.getByTestId("month-calendar-next").props.accessibilityLabel).toBe("Próximo mês");
      expect(view.getByTestId("month-calendar-prev").props.accessibilityLabel).toBe("Mês anterior");
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx jest tests/unit/month-calendar-component.test.ts`
Expected: FAIL, `Cannot find module '../../src/components/domain/MonthCalendar'`.

- [ ] **Step 3: Add the labels.** In `common` of each locale file, keep keys alphabetical:
  - `en.ts`: `nextMonth: "Next month"`, `previousMonth: "Previous month"`
  - `pt.ts`: `nextMonth: "Próximo mês"`, `previousMonth: "Mês anterior"`
  - `es.ts`: `nextMonth: "Mes siguiente"`, `previousMonth: "Mes anterior"`

- [ ] **Step 4: Implement** `src/components/domain/MonthCalendar.tsx`

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useLanguage } from "../../i18n/use-language";
import { addLocalDays } from "../../lib/dates/calendar-strip-days";
import { BOOKING_DAYS_AHEAD, addMonths, buildMonthGrid, isDateBookable } from "../../lib/dates/month-calendar";
import { colors } from "../../lib/design/colors";
import { formatDateLabel } from "../../lib/i18n/format";

export type MonthCalendarProps = {
  maxDaysAhead?: number;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  testID?: string;
  today: string;
};

export function MonthCalendar({ maxDaysAhead = BOOKING_DAYS_AHEAD, onSelectDate, selectedDate, testID, today }: MonthCalendarProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const currentMonth = today.slice(0, 7);
  const lastMonth = addLocalDays(today, maxDaysAhead).slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const grid = buildMonthGrid(month, language);
  const canGoBack = month > currentMonth;
  const canGoForward = month < lastMonth;

  return (
    <View className="w-full max-w-[420px] gap-2" testID={testID}>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel={t("common.previousMonth")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          className={`h-10 w-10 items-center justify-center rounded-full ${canGoBack ? "" : "opacity-30"}`}
          disabled={!canGoBack}
          onPress={() => setMonth(addMonths(month, -1))}
          testID="month-calendar-prev"
        >
          <ChevronLeft color={colors.ink} size={20} />
        </Pressable>
        <Text accessibilityRole="header" className="text-base font-sans-semibold text-ink" testID="month-calendar-title">
          {grid.label}
        </Text>
        <Pressable
          accessibilityLabel={t("common.nextMonth")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoForward }}
          className={`h-10 w-10 items-center justify-center rounded-full ${canGoForward ? "" : "opacity-30"}`}
          disabled={!canGoForward}
          onPress={() => setMonth(addMonths(month, 1))}
          testID="month-calendar-next"
        >
          <ChevronRight color={colors.ink} size={20} />
        </Pressable>
      </View>
      <View className="flex-row">
        {grid.weekdayLabels.map((label, index) => (
          <Text className="mx-0.5 flex-1 text-center text-xs font-sans-medium text-neutral-500" key={index}>
            {label}
          </Text>
        ))}
      </View>
      {grid.weeks.map((week, weekIndex) => (
        <View className="flex-row" key={weekIndex}>
          {week.map((date, dayIndex) => {
            if (!date) return <View className="m-0.5 aspect-square flex-1" key={dayIndex} />;

            const bookable = isDateBookable(date, today, maxDaysAhead);
            const selected = date === selectedDate;

            return (
              <Pressable
                accessibilityLabel={formatDateLabel(date, language)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !bookable, selected }}
                className={`m-0.5 aspect-square flex-1 items-center justify-center rounded-2xl ${selected ? "bg-ink" : "bg-transparent"}`}
                disabled={!bookable}
                key={date}
                onPress={() => onSelectDate(date)}
                testID={`month-calendar-day-${date}`}
              >
                <Text
                  className={`text-base font-sans-semibold ${selected ? "text-white" : bookable ? "text-ink" : "text-neutral-300"}`}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {Number(date.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
```

Add `export * from "./MonthCalendar";` (matching the file's existing export style) to `src/components/domain/index.ts`.

- [ ] **Step 5: Run it and confirm it passes**

Run: `npx jest tests/unit/month-calendar-component.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts tests/unit/component-exports.test.ts`
Expected: PASS. If `toBeDisabled` does not reflect `disabled` on `Pressable`, assert `props.accessibilityState.disabled` instead; keep the press-does-nothing assertion.

- [ ] **Step 6: Commit**

```bash
git add src/components/domain src/i18n/locales tests/unit/month-calendar-component.test.ts
git commit -m "feat(calendar): MonthCalendar component with month navigation"
```

---

### Task 3: Wire the screens, e2e, docs, gate

**Files:**
- Modify: `app/(customer)/book/date.tsx`, `app/(customer)/reschedule.tsx`
- Modify: `tests/e2e/booking.web.spec.ts` (month navigation assertion)
- Modify: `docs/project-status.md`

**Interfaces:**
- Consumes: `MonthCalendar`, `formatInstantInShopTime` (from `src/lib/dates/shop-time.ts`).

- [ ] **Step 1: Write the failing e2e assertion.** Open `tests/e2e/booking.web.spec.ts`; at the point where the flow reaches the date step (just before the first `getByRole("button", { name: "Continue to review" }).click()`), add:

```ts
  await expect(page.getByTestId("month-calendar-title")).toBeVisible();
  await expect(page.getByTestId("month-calendar-prev")).toBeDisabled();
  await page.getByTestId("month-calendar-next").click();
  await page.getByTestId("month-calendar-prev").click();
```

Run: `npm run test:e2e:web -- booking.web.spec.ts`
Expected: FAIL, `month-calendar-title` not found (the screen still renders the strip).

- [ ] **Step 2: Swap the component in `app/(customer)/book/date.tsx`.** Remove the `CalendarStrip`, `useLanguage`, `buildCalendarStripDays` imports, the `DAYS_AHEAD` constant, `language`, and `days`. Add imports for `MonthCalendar` and `formatInstantInShopTime` (`../../../src/lib/dates/shop-time`). Replace the state lines and the strip wrapper:

```tsx
  const today = useMemo(() => formatInstantInShopTime(new Date()).localDate, []);
  const [localDate, setLocalDate] = useState(today);
```
```tsx
        <MonthCalendar onSelectDate={setLocalDate} selectedDate={localDate} today={today} />
```
(the `<View className="w-full">` wrapper around the strip goes away; `MonthCalendar` centres itself with its own `max-w-[420px]`).

- [ ] **Step 3: Swap the component in `app/(customer)/reschedule.tsx`** the same way: drop `CalendarStrip`, `useLanguage`, `buildCalendarStripDays`, `DAYS_AHEAD`, `language`, `days`; add `today`; initial `localDate` is `today`; render

```tsx
          <MonthCalendar
            onSelectDate={(date) => { setLocalDate(date); setStartsAt(null); }}
            selectedDate={localDate}
            today={today}
          />
```

- [ ] **Step 4: No i18n e2e change.** `tests/e2e/i18n.web.spec.ts` "the calendar strip uses Portuguese weekday names" targets `/appointments` (still the strip), and the `pt` month and button labels are covered by the component unit test.

- [ ] **Step 5: Run the gate**

Run: `npm run typecheck && npm run lint && npm run verify && npm run test:e2e:web && npm run export:web`
Expected: all PASS. The reschedule e2e (`customer-lifecycle.web.spec.ts`) relies on the default date being today, which is unchanged.

- [ ] **Step 6: Visual check.** Start the web app, open the book date step and the reschedule screen at 360x640 and at desktop width: grid aligned with the weekday header, six-row months do not clip the "Continue" button, dimmed days look disabled, selected day is dark. Check computed styles (background of the selected cell, `opacity` on a disabled arrow) rather than trusting the screenshot alone.

- [ ] **Step 7: Docs and commit.** In `docs/project-status.md` add, above the Task 15 line: `- Task 16 — month calendar: the book date step and the reschedule screen use a month grid with month navigation and a 30 day booking window instead of the 14 day carousel (the Agenda tab keeps the strip).` and a verification line with the real numbers from Step 5.

```bash
git add app tests docs
git commit -m "feat(calendar): month grid on book and reschedule, 30 day window"
```

- [ ] **Step 8: Review.** Invoke `requesting-code-review` on `origin/main..HEAD` with this plan as the requirements, fix Critical/Important findings, re-run the gate, then push the branch and open a PR against `main` (no force-push, no merge without being asked).
