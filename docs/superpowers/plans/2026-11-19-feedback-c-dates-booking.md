# Feedback 18/11 — PR C: dates and the owner booking flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared `DateField` (locale date with `‹ ›` arrows and a calendar pop-up) used by the owner Agenda, the owner booking form and the closed dates; a clearer "Closed dates" section (future dates only, remove button, "Add closed date" → calendar → confirmation); and an owner booking form where the service and the professional are two steps (service first, then only the professionals who offer it).

**Architecture:** Three small, tested units: a pure `stepDate(date, unit, direction)` (day / week / month with end-of-month clamping), a `CalendarPopup` (project pop-up style, month grid, min/max/disabled dates, built on the existing `buildMonthGrid`/`addMonths` helpers, **not** on the inline swipeable `MonthCalendar`, which is hard-wired to "today + 30 days" and cannot show past dates) and `DateField` on top of both. The Agenda replaces its text date box **and** its previous/next buttons with `DateField` (arrows step by the selected view). The closed-dates block becomes its own `ClosedDatesCard` so its pop-up + confirmation are unit-testable. The booking form gains a `professional` step and swaps its date step for `DateField`.

**Tech Stack:** Expo SDK 58 / React Native 0.88 / react-native-web, Expo Router, TanStack Query, react-i18next (pt/es/en parity), `lucide-react-native`, Jest (jest-expo, RNTL 14 async `render`), Playwright (system Chrome).

**Spec:** `docs/superpowers/specs/2026-11-19-feedback-1811-design.md` (section "PR C — dates and the owner booking flow")

**Branch:** `feat-feedback-c-dates-booking`, cut from `main` **after PR B is merged** (B adds `useFocusEffect` reset to `app/(owner)/appointment-form.tsx`; this plan extends it). If A is merged too, Task 4 starts from A's `agendaNavKeys` change.

## Open questions for the orchestrator

1. **The owner booking form's date is NOT a text field today (spec vs code).** The spec says "the owner booking form date ('Local date' text field today)". In the code, the form's date step is `DateStep` (`src/features/availability/steps.tsx`): an inline `MonthCalendar` (today … today+30 days) plus a Continue button, shared with the reschedule, move, conflict and customer-booking flows. The only text date fields are the Agenda box (`DateInput`, testID `owner-agenda-date`) and the closed-dates input (`shop-closed-date`). **Plan does:** replaces *only the owner form's* date step by `DateField` + Continue (min = today, max = today + `BOOKING_DAYS_AHEAD` = 30 days, the same window as today); `DateStep` stays untouched for the other four flows. If the user wants the inline calendar kept in the owner form, drop Task 6 step "date" and keep the rest.
2. **Month step in the Agenda.** Today the month view's next/previous move 31 days, and the month range is "start date + 30 days" (`agendaRange`). The spec says the arrow moves "a month in month view". **Plan does:** a calendar month (`2026-01-31` + 1 month → `2026-02-28`); `agendaRange` is left as it is.
3. **Agenda date range limits.** The Agenda must reach past dates (the owner reviews old days), so its `DateField` has no min/max. Only closed dates (min = today) and the booking form (today … +30) set limits.
4. **"Remove button"** on closed dates: the list already has a "Reopen" button per future date (`shop-reopen-<date>`, text `owner.shop.reopen`). **Plan keeps it** (same action, wording the owner already knows) and only restructures the add flow. Past closed dates are already not listed (`closedDates()` drops dates before today).
5. **Pop-up for the already-closed days:** picking a day that is already closed makes no sense, so the closed-dates calendar shows those days disabled (`disabledDates`).

## Global Constraints

- `DateField`: the date formatted for the locale with `‹` and `›` buttons on the sides; the arrows move **one step without opening anything** (a day; a week in the Agenda's week view; a month in month view). Tapping the date opens a **calendar pop-up** in the project pop-up style (centred floating card, **X top-right**, **tap outside closes**) with `‹ ›` to change month; tapping a day selects it and closes. Optional min/max date.
- Used in: the owner Agenda date box, the owner booking form date, closed dates.
- Closed dates (Manage → Opening hours): "Closed dates" lists the **future** closed dates (each with a remove button) and an "Add closed date" button opens the calendar; **picking a day asks for confirmation before closing it**. Past dates are not listed.
- Owner booking form: **service and professional are two steps**: first the service, then only the professionals who offer it.
- Other owner screens that still type dates as text stay as they are.
- Texts pt/es/en with parity (`tests/unit/locale-parity.test.ts`); no hard-coded text; colours by tokens; `className` only on plain React Native elements; pop-ups are centred floating cards (like `AppointmentSheet`/`ConfirmDialog`); every `<Input>` has a placeholder (none added here).
- **Gate per task:** `npm run typecheck`, `./node_modules/.bin/eslint app src tests scripts`, the Jest files named. **Final gate (Task 7):** `npm run typecheck`, ROOT `npm run lint` (read the real output and exit code, never `| tail`), whole Jest suite, **re-run after the last commit**, browser screenshots of changed screens.

## Order between the four plans

- **B before C** (both edit `app/(owner)/appointment-form.tsx`; B's reset must be extended by Task 6 here with `setSelectedServiceId(null)`).
- **A before or after C**: A's Task 6 (range line, `agendaNavKeys.range`, "Calendar" titles) and this plan's Task 4 both edit `app/(owner)/agenda.tsx` and `src/features/appointments/agenda-nav.ts`. If A merged first, Task 4 removes `next`/`previous` from `agendaNavKeys` and keeps A's `range`; if C goes first, Task 4 leaves the "Day: <date>" line as it is (A hides it later). B's agenda change (`?date=&open=` effect) is a separate hunk.
- **D** does not touch these files.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/dates/step-date.ts` (new) | `stepDate(date, unit, direction)` |
| `src/components/domain/CalendarPopup.tsx` (new) | the calendar pop-up (month grid, min/max/disabled, close) |
| `src/components/ui/DateField.tsx` (new) | `‹ date ›` + opens `CalendarPopup` |
| `src/features/shops/ClosedDatesCard.tsx` (new) | closed-dates list, "Add closed date", calendar + confirmation |
| `app/(owner)/agenda.tsx` (modify) | `DateField` replaces the text box and the prev/next buttons |
| `src/features/appointments/agenda-nav.ts` (modify) | drop `next`/`previous` keys |
| `app/(owner)/shop.tsx` (modify) | mount `ClosedDatesCard`; `closeShop` takes the date |
| `app/(owner)/appointment-form.tsx` (modify) | `professional` step, `DateField` date step, reset extended |
| `src/i18n/locales/{en,es,pt}.ts` (modify) | `dateField.*`, `owner.shop.closed*`, `owner.appointmentForm.professionalTitle/steps.professional` |
| `tests/unit/step-date.test.ts`, `calendar-popup.test.ts`, `date-field.test.ts`, `closed-dates-card.test.ts`, `owner-appointment-form-steps.test.ts`, `agenda-nav.test.ts` | Jest |
| `tests/e2e/owner-agenda.web.spec.ts`, `owner-shop.web.spec.ts`, `owner-appointment-form.web.spec.ts` | updated/added Playwright |

---

### Task 1: `stepDate` (pure date stepping)

**Files:**
- Create: `src/lib/dates/step-date.ts`
- Test: `tests/unit/step-date.test.ts`

**Interfaces:**
- Consumes: `addLocalDays(localDate: string, days: number): string` (`src/lib/dates/calendar-strip-days.ts`), `addMonths(month: string, delta: number): string` (`src/lib/dates/month-calendar.ts`).
- Produces: `export type StepUnit = "day" | "week" | "month"; export function stepDate(date: string, unit: StepUnit, direction: -1 | 1): string` (ISO `YYYY-MM-DD` in and out).

- [ ] **Step 1: Write the failing test**

```ts
import { stepDate } from "../../src/lib/dates/step-date";

describe("stepDate", () => {
  it("moves by a day", () => {
    expect(stepDate("2026-11-30", "day", 1)).toBe("2026-12-01");
    expect(stepDate("2026-03-01", "day", -1)).toBe("2026-02-28");
  });

  it("moves by a week", () => {
    expect(stepDate("2026-11-25", "week", 1)).toBe("2026-12-02");
    expect(stepDate("2026-11-03", "week", -1)).toBe("2026-10-27");
  });

  it("moves by a calendar month and clamps the day", () => {
    expect(stepDate("2026-01-31", "month", 1)).toBe("2026-02-28");
    expect(stepDate("2028-01-31", "month", 1)).toBe("2028-02-29");
    expect(stepDate("2026-03-31", "month", -1)).toBe("2026-02-28");
    expect(stepDate("2026-12-15", "month", 1)).toBe("2027-01-15");
    expect(stepDate("2026-01-15", "month", -1)).toBe("2025-12-15");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/step-date.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { addLocalDays } from "./calendar-strip-days";
import { addMonths } from "./month-calendar";

export type StepUnit = "day" | "week" | "month";

// The date one step away: a day, a week, or a calendar month (the day of the month is kept, or clamped to the last day of a shorter month).
export function stepDate(date: string, unit: StepUnit, direction: -1 | 1): string {
  if (unit === "day") return addLocalDays(date, direction);
  if (unit === "week") return addLocalDays(date, direction * 7);

  const month = addMonths(date.slice(0, 7), direction);
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return `${month}-${String(Math.min(Number(date.slice(8)), lastDay)).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest tests/unit/step-date.test.ts tests/unit/month-calendar.test.ts tests/unit/calendar-strip-days.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(dates): stepDate by day, week or month" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `CalendarPopup`

**Files:**
- Create: `src/components/domain/CalendarPopup.tsx`
- Modify: `src/i18n/locales/{en,es,pt}.ts` (new `dateField` block, see Task 3 Step 3 — add the keys this task needs now: `dateField.close`)
- Test: `tests/unit/calendar-popup.test.ts`

**Interfaces:**
- Consumes: `buildMonthGrid(month: string, language: Language): { label; weekdayLabels; weeks: (string | null)[][] }`, `addMonths` (`src/lib/dates/month-calendar.ts`); `useLanguage()`; `formatDateLabel(localDate, language)` (a11y label per day); `common.previousMonth` / `common.nextMonth` (exist).
- Produces: `export type CalendarPopupProps = { disabledDates?: readonly string[]; max?: string; min?: string; onClose: () => void; onSelect: (date: string) => void; title: string; value: string; visible: boolean }` and `export function CalendarPopup(props): JSX.Element | null`. testIDs: `date-picker` (the card), `date-picker-backdrop`, `date-picker-close`, `date-picker-prev`, `date-picker-next`, `date-picker-title` (month label), `date-picker-day-<YYYY-MM-DD>`. `onSelect` is called with the ISO date; the **caller** closes (`DateField` does).

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { CalendarPopup } from "../../src/components/domain/CalendarPopup";
import i18n from "../../src/i18n";

const base = { onClose: jest.fn(), onSelect: jest.fn(), title: "Choose date", value: "2026-10-15", visible: true };
const show = (props: Partial<React.ComponentProps<typeof CalendarPopup>> = {}) => render(React.createElement(CalendarPopup, { ...base, ...props }));

describe("CalendarPopup", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("renders nothing while hidden", async () => {
    const view = await show({ visible: false });

    expect(view.queryByTestId("date-picker")).toBeNull();
  });

  it("opens on the month of the value and selects a day", async () => {
    const view = await show();

    expect(view.getByTestId("date-picker-title")).toHaveTextContent("October 2026");
    await fireEvent.press(view.getByTestId("date-picker-day-2026-10-20"));

    expect(base.onSelect).toHaveBeenCalledWith("2026-10-20");
  });

  it("changes month with the arrows", async () => {
    const view = await show();

    await fireEvent.press(view.getByTestId("date-picker-next"));
    expect(view.getByTestId("date-picker-title")).toHaveTextContent("November 2026");
    await fireEvent.press(view.getByTestId("date-picker-prev"));
    await fireEvent.press(view.getByTestId("date-picker-prev"));
    expect(view.getByTestId("date-picker-title")).toHaveTextContent("September 2026");
  });

  it("disables days before min and after max, and stops the month arrows there", async () => {
    const view = await show({ max: "2026-11-10", min: "2026-10-10" });

    expect(view.getByTestId("date-picker-day-2026-10-09")).toBeDisabled();
    expect(view.getByTestId("date-picker-day-2026-10-10")).not.toBeDisabled();
    await fireEvent.press(view.getByTestId("date-picker-day-2026-10-09"));
    expect(base.onSelect).not.toHaveBeenCalled();
    expect(view.getByTestId("date-picker-prev")).toBeDisabled();
    await fireEvent.press(view.getByTestId("date-picker-next"));
    expect(view.getByTestId("date-picker-day-2026-11-11")).toBeDisabled();
    expect(view.getByTestId("date-picker-next")).toBeDisabled();
  });

  it("disables the listed dates", async () => {
    const view = await show({ disabledDates: ["2026-10-22"] });

    expect(view.getByTestId("date-picker-day-2026-10-22")).toBeDisabled();
    expect(view.getByTestId("date-picker-day-2026-10-23")).not.toBeDisabled();
  });

  it("marks the current value as selected", async () => {
    const view = await show();

    expect(view.getByTestId("date-picker-day-2026-10-15").props.accessibilityState).toMatchObject({ selected: true });
  });

  it("closes from the X and from a tap outside, but not from a tap on the card", async () => {
    const view = await show();

    await fireEvent.press(view.getByTestId("date-picker"));
    expect(base.onClose).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("date-picker-close"));
    await fireEvent.press(view.getByTestId("date-picker-backdrop"));

    expect(base.onClose).toHaveBeenCalledTimes(2);
  });

  it("reopens on the value's month after it moved", async () => {
    const view = await show();

    await fireEvent.press(view.getByTestId("date-picker-next"));
    await view.rerender(React.createElement(CalendarPopup, { ...base, visible: false }));
    await view.rerender(React.createElement(CalendarPopup, { ...base, value: "2026-12-03" }));

    expect(view.getByTestId("date-picker-title")).toHaveTextContent("December 2026");
  });
});
```

(`toHaveTextContent` / `toBeDisabled` come from `@testing-library/react-native`'s built-in matchers; `tests/unit/month-calendar-component.test.ts` already uses `toBeDisabled`. If `toHaveTextContent` is not registered in this setup, use `view.getByTestId(...).props.children` or `view.getByText("October 2026")`.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/calendar-popup.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/components/domain/CalendarPopup.tsx`

```tsx
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { useLanguage } from "../../i18n/use-language";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { addMonths, buildMonthGrid } from "../../lib/dates/month-calendar";
import { formatDateLabel } from "../../lib/i18n/format";

export type CalendarPopupProps = {
  disabledDates?: readonly string[];
  max?: string;
  min?: string;
  onClose: () => void;
  onSelect: (date: string) => void;
  title: string;
  value: string;
  visible: boolean;
};

// A centred floating calendar (the project's pop-up style: X top-right, tap outside closes). Unlike the inline MonthCalendar it has
// no booking window: it shows any month between `min` and `max` (both optional), so it can also pick past dates.
export function CalendarPopup({ disabledDates = [], max, min, onClose, onSelect, title, value, visible }: CalendarPopupProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [month, setMonth] = useState(value.slice(0, 7));

  // Every opening starts on the month of the current value.
  useEffect(() => {
    if (visible) setMonth(value.slice(0, 7));
  }, [visible, value]);

  if (!visible) return null;
  const grid = buildMonthGrid(month, language);
  const canGoBack = !min || addMonths(month, -1) >= min.slice(0, 7);
  const canGoForward = !max || addMonths(month, 1) <= max.slice(0, 7);
  const isEnabled = (date: string) => !(min && date < min) && !(max && date > max) && !disabledDates.includes(date);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID="date-picker-backdrop">
        <Pressable className="w-full max-w-[360px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="date-picker">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("dateField.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="date-picker-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityLabel={t("common.previousMonth")}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canGoBack }}
              className={`h-10 w-10 items-center justify-center rounded-full ${canGoBack ? "" : "opacity-30"}`}
              disabled={!canGoBack}
              onPress={() => setMonth(addMonths(month, -1))}
              testID="date-picker-prev"
            >
              <ChevronLeft color={colors.ink} size={20} />
            </Pressable>
            <Text accessibilityRole="header" className="text-base font-sans-semibold text-ink" testID="date-picker-title">{grid.label}</Text>
            <Pressable
              accessibilityLabel={t("common.nextMonth")}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canGoForward }}
              className={`h-10 w-10 items-center justify-center rounded-full ${canGoForward ? "" : "opacity-30"}`}
              disabled={!canGoForward}
              onPress={() => setMonth(addMonths(month, 1))}
              testID="date-picker-next"
            >
              <ChevronRight color={colors.ink} size={20} />
            </Pressable>
          </View>
          <View className="gap-2">
            <View className="flex-row">
              {grid.weekdayLabels.map((label, index) => (
                <Text className="mx-0.5 flex-1 text-center text-xs font-sans-medium text-neutral-500" key={index}>{label}</Text>
              ))}
            </View>
            {grid.weeks.map((week, weekIndex) => (
              <View className="flex-row" key={weekIndex}>
                {week.map((date, dayIndex) => {
                  if (!date) return <View className="m-0.5 aspect-square flex-1" key={dayIndex} />;
                  const enabled = isEnabled(date);
                  const selected = date === value;

                  return (
                    <Pressable
                      accessibilityLabel={formatDateLabel(date, language)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !enabled, selected }}
                      className={`m-0.5 aspect-square flex-1 items-center justify-center rounded-2xl ${selected ? "bg-ink" : "bg-transparent"}`}
                      disabled={!enabled}
                      key={date}
                      onPress={() => onSelect(date)}
                      testID={`date-picker-day-${date}`}
                    >
                      <Text className={`text-base font-sans-semibold ${selected ? "text-white" : enabled ? "text-ink" : "text-neutral-300"}`} style={{ fontVariant: ["tabular-nums"] }}>
                        {Number(date.slice(8))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

i18n (all three locales, new top-level block `dateField`, alphabetical position as the file does it; Task 3 adds the rest): `dateField: { close: "Close" }` / pt `"Fechar"` / es `"Cerrar"`. (To avoid a half-filled block, add the whole block from Task 3 Step 3 now.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest tests/unit/calendar-popup.test.ts tests/unit/locale-parity.test.ts tests/unit/no-hardcoded-text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(ui): calendar pop-up with min/max/disabled dates" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `DateField`

**Files:**
- Create: `src/components/ui/DateField.tsx`
- Modify: `src/i18n/locales/{en,es,pt}.ts`
- Test: `tests/unit/date-field.test.ts`

**Interfaces:**
- Consumes: `stepDate`, `StepUnit` (Task 1), `CalendarPopup` (Task 2), `formatDateNumeric(localDate, language)`, `useLanguage()`.
- Produces:
  ```ts
  export type DateFieldProps = {
    disabledDates?: readonly string[];
    label: string;
    max?: string;
    min?: string;
    onChange: (date: string) => void;
    step?: StepUnit; // arrow step, default "day"
    testID: string;
    value: string; // ISO YYYY-MM-DD, always valid
  };
  export function DateField(props: DateFieldProps): JSX.Element;
  ```
  testIDs: `${testID}` (the date button that opens the pop-up), `${testID}-prev`, `${testID}-next`. Arrows are disabled when the next step would leave `[min, max]` (a month step lands on the clamped date).

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { DateField } from "../../src/components/ui/DateField";
import i18n from "../../src/i18n";

const show = (props: Partial<React.ComponentProps<typeof DateField>> = {}) => {
  const onChange = jest.fn();
  const view = render(React.createElement(DateField, { label: "Local date", onChange, testID: "df", value: "2026-10-15", ...props }));

  return { onChange, view };
};

describe("DateField", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows the label and the formatted date", async () => {
    const { view } = show();
    const rendered = await view;

    expect(rendered.getByText("Local date")).toBeTruthy();
    expect(rendered.getByTestId("df")).toHaveTextContent("2026-10-15");
  });

  it("the arrows move one day without opening the calendar", async () => {
    const { onChange, view } = show();
    const rendered = await view;

    await fireEvent.press(rendered.getByTestId("df-next"));
    await fireEvent.press(rendered.getByTestId("df-prev"));

    expect(onChange).toHaveBeenNthCalledWith(1, "2026-10-16");
    expect(onChange).toHaveBeenNthCalledWith(2, "2026-10-14");
    expect(rendered.queryByTestId("date-picker")).toBeNull();
  });

  it("steps by a week or by a month when asked", async () => {
    const week = show({ step: "week" });
    await fireEvent.press((await week.view).getByTestId("df-next"));
    expect(week.onChange).toHaveBeenCalledWith("2026-10-22");

    const month = show({ step: "month", value: "2026-01-31" });
    await fireEvent.press((await month.view).getByTestId("df-next"));
    expect(month.onChange).toHaveBeenCalledWith("2026-02-28");
  });

  it("names the arrows after the step", async () => {
    const rendered = await show({ step: "week" }).view;

    expect(rendered.getByLabelText("Previous week")).toBeTruthy();
    expect(rendered.getByLabelText("Next week")).toBeTruthy();
  });

  it("opens the calendar on tap, selects a day and closes", async () => {
    const { onChange, view } = show();
    const rendered = await view;

    await fireEvent.press(rendered.getByTestId("df"));
    expect(rendered.getByTestId("date-picker")).toBeTruthy();
    await fireEvent.press(rendered.getByTestId("date-picker-day-2026-10-27"));

    expect(onChange).toHaveBeenCalledWith("2026-10-27");
    expect(rendered.queryByTestId("date-picker")).toBeNull();
  });

  it("disables the arrows at min and max", async () => {
    const rendered = await show({ max: "2026-10-16", min: "2026-10-15" }).view;

    expect(rendered.getByTestId("df-prev")).toBeDisabled();
    expect(rendered.getByTestId("df-next")).not.toBeDisabled();
    await fireEvent.press(rendered.getByTestId("df-next"));
  });

  it("passes min and max to the calendar", async () => {
    const rendered = await show({ min: "2026-10-10" }).view;

    await fireEvent.press(rendered.getByTestId("df"));

    expect(rendered.getByTestId("date-picker-day-2026-10-09")).toBeDisabled();
  });
});
```

(In the "disables the arrows at min and max" test, the final `fireEvent.press` of `df-next` with `onChange` mocked does not change `value`; delete that line if lint flags it as useless.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/date-field.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

i18n, new `dateField` block in each locale (Task 2 added `close`; add the rest):
- en: `choose: "Choose date"`, `close: "Close"`, `nextDay: "Next day"`, `nextMonth: "Next month"`, `nextWeek: "Next week"`, `previousDay: "Previous day"`, `previousMonth: "Previous month"`, `previousWeek: "Previous week"`
- pt: `choose: "Escolher data"`, `close: "Fechar"`, `nextDay: "Próximo dia"`, `nextMonth: "Próximo mês"`, `nextWeek: "Próxima semana"`, `previousDay: "Dia anterior"`, `previousMonth: "Mês anterior"`, `previousWeek: "Semana anterior"`
- es: `choose: "Elegir fecha"`, `close: "Cerrar"`, `nextDay: "Día siguiente"`, `nextMonth: "Mes siguiente"`, `nextWeek: "Semana siguiente"`, `previousDay: "Día anterior"`, `previousMonth: "Mes anterior"`, `previousWeek: "Semana anterior"`

`src/components/ui/DateField.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { CalendarPopup } from "../domain/CalendarPopup";
import { useLanguage } from "../../i18n/use-language";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { stepDate } from "../../lib/dates/step-date";
import type { StepUnit } from "../../lib/dates/step-date";
import { formatDateNumeric } from "../../lib/i18n/format";

export type DateFieldProps = {
  disabledDates?: readonly string[];
  label: string;
  max?: string;
  min?: string;
  onChange: (date: string) => void;
  step?: StepUnit;
  testID: string;
  value: string;
};

const PREVIOUS = { day: "dateField.previousDay", month: "dateField.previousMonth", week: "dateField.previousWeek" } as const;
const NEXT = { day: "dateField.nextDay", month: "dateField.nextMonth", week: "dateField.nextWeek" } as const;

// `‹ 15/10/2026 ›`: the arrows move one step (a day, a week or a month) and never open anything; tapping the date opens a calendar.
export function DateField({ disabledDates, label, max, min, onChange, step = "day", testID, value }: DateFieldProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const previous = stepDate(value, step, -1);
  const next = stepDate(value, step, 1);
  const canGoBack = !min || previous >= min;
  const canGoForward = !max || next <= max;
  const arrow = "h-input-height w-11 items-center justify-center rounded-xl border border-neutral-200 bg-surface";

  return (
    <View className="gap-1">
      <Text className="text-sm font-sans-medium text-neutral-700">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityLabel={t(PREVIOUS[step])} accessibilityRole="button" accessibilityState={{ disabled: !canGoBack }} className={`${arrow} ${canGoBack ? "" : "opacity-30"}`} disabled={!canGoBack} onPress={() => onChange(previous)} testID={`${testID}-prev`}>
          <ChevronLeft color={colors.ink} size={20} />
        </Pressable>
        <Pressable accessibilityLabel={`${label}: ${formatDateNumeric(value, language)}. ${t("dateField.choose")}`} accessibilityRole="button" className="h-input-height flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-surface px-4" onPress={() => setOpen(true)} testID={testID}>
          <Text className="text-base font-sans-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(value, language)}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t(NEXT[step])} accessibilityRole="button" accessibilityState={{ disabled: !canGoForward }} className={`${arrow} ${canGoForward ? "" : "opacity-30"}`} disabled={!canGoForward} onPress={() => onChange(next)} testID={`${testID}-next`}>
          <ChevronRight color={colors.ink} size={20} />
        </Pressable>
      </View>
      <CalendarPopup
        disabledDates={disabledDates}
        max={max}
        min={min}
        onClose={() => setOpen(false)}
        onSelect={(date) => {
          setOpen(false);
          onChange(date);
        }}
        title={label}
        value={value}
        visible={open}
      />
    </View>
  );
}
```

(`toHaveTextContent("2026-10-15")` in the test relies on `formatDateNumeric("2026-10-15","en")`: check `src/lib/i18n/format.ts:25` — if English prints `10/15/2026`, change that one assertion to the real output; do not change the formatter.)

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest tests/unit/date-field.test.ts tests/unit/calendar-popup.test.ts tests/unit/locale-parity.test.ts tests/unit/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A src tests
git commit -m "feat(ui): DateField with arrows and calendar pop-up" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Owner Agenda uses `DateField`

**Files:**
- Modify: `app/(owner)/agenda.tsx`, `src/features/appointments/agenda-nav.ts`, `src/i18n/locales/{en,es,pt}.ts` (remove the now-unused `owner.agenda.next*/previous*` keys), `tests/unit/agenda-nav.test.ts`
- Modify (e2e): `tests/e2e/owner-agenda.web.spec.ts` (lines ~95–138)

**Interfaces:**
- Consumes: `DateField` (Task 3), `StepUnit`. `agendaNavKeys(view)` now returns `{ title }` plus, if PR A is merged, `range`.

- [ ] **Step 1: Write the failing test** (`tests/unit/agenda-nav.test.ts`; the exact expected object depends on whether A is merged: with A `{ range, title }`, without A `{ title }`):

```ts
it("returns the per-view title key (the arrows now live in DateField)", () => {
  expect(agendaNavKeys("day").title).toBe("owner.agenda.titleDay");
  expect(agendaNavKeys("week").title).toBe("owner.agenda.titleWeek");
  expect(agendaNavKeys("month").title).toBe("owner.agenda.titleMonth");
  expect(agendaNavKeys("week")).not.toHaveProperty("next");
  expect(agendaNavKeys("week")).not.toHaveProperty("previous");
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx jest tests/unit/agenda-nav.test.ts` — FAIL (`next` still exists).

- [ ] **Step 3: Implement**

`agenda-nav.ts`: delete the `next` and `previous` entries (keep `title`, and A's `range` if present). In the locales delete `owner.agenda.nextDay/Week/Month` and `previousDay/Week/Month` (pt/es/en) after `rtk grep -rn "owner.agenda.next\|owner.agenda.previous" app src tests` shows no other use.

`app/(owner)/agenda.tsx`:
- imports: add `import { DateField } from "../../src/components/ui/DateField";`; remove `DateInput` (and `Button` only if nothing else uses it — it still does: new-appointment and view buttons).
- delete `moveRange` and `dateValid`; the range becomes `const range = useMemo(() => agendaRange(localDate, view), [localDate, view]);`, and `enabled: shopId !== null` on the agenda query (remove the `&& dateValid`).
- replace the `DateInput`, the range `Text` (leave A's `nav.range` line if present) and the `flex-row gap-2` prev/next block with:

```tsx
            <DateField label={t("common.localDate")} onChange={(value) => { setLocalDate(value); setOffset(0); }} step={view} testID="owner-agenda-date" value={localDate} />
```

  followed (if A is merged) by A's `{nav.range ? <Text …>…</Text> : null}` line. The loading disabled state of the old arrows is dropped on purpose (changing date while loading just refetches).

E2E `tests/e2e/owner-agenda.web.spec.ts`: delete the text-typing test (lines ~92–108: `fill`/`pressSequentially`/Backspace) and the "ghost example" test (lines ~131–138), and replace the "previous/next buttons and the title follow the selected view" test with the three below (reusing `signInAsOwner`, `mockOwnerRest`):

```ts
test("the date field arrows step by the selected view and ask for the matching range", async ({ page }) => {
  const ranges: string[] = [];

  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, noOverrides: true, rows: [] });
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/list_owner_agenda")) ranges.push((request.postDataJSON() as { range_start: string }).range_start);
  });

  await page.goto("/agenda");
  await expect(page.getByRole("heading", { name: "Day agenda" })).toBeVisible();
  await expect.poll(() => ranges.length).toBeGreaterThan(0);
  const start = ranges.at(-1)!;

  await page.getByTestId("owner-agenda-date-next").click();
  await expect.poll(() => ranges.at(-1)).toBe(new Date(Date.parse(`${start}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10));

  await page.getByTestId("owner-view-week").click();
  await expect(page.getByRole("heading", { name: "Week agenda" })).toBeVisible();
  await expect(page.getByLabel("Next week")).toBeVisible();
  const beforeWeek = ranges.at(-1)!;
  await page.getByTestId("owner-agenda-date-next").click();
  await expect.poll(() => ranges.at(-1)).toBe(new Date(Date.parse(`${beforeWeek}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));

  await page.getByTestId("owner-view-month").click();
  await expect(page.getByRole("heading", { name: "Month agenda" })).toBeVisible();
  await expect(page.getByLabel("Next month")).toBeVisible();
});

test("tapping the date opens the calendar pop-up; picking a day loads that day", async ({ page }) => {
  const ranges: string[] = [];

  await signInAsOwner(page);
  await mockOwnerRest(page, { calls: {}, noOverrides: true, rows: [] });
  page.on("request", (request) => {
    if (request.url().endsWith("/rpc/list_owner_agenda")) ranges.push((request.postDataJSON() as { range_start: string }).range_start);
  });

  await page.goto("/agenda");
  await page.getByTestId("owner-agenda-date").click();
  await expect(page.getByTestId("date-picker")).toBeVisible();
  // A past day is allowed in the Agenda (no min).
  await page.locator('[data-testid^="date-picker-day-"]').first().click();
  await expect(page.getByTestId("date-picker")).toHaveCount(0);
  await expect.poll(() => ranges.at(-1)).toMatch(/^\d{4}-\d{2}-01$/);

  await page.getByTestId("owner-agenda-date").click();
  await page.getByTestId("date-picker-close").click();
  await expect(page.getByTestId("date-picker")).toHaveCount(0);
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/agenda-nav.test.ts tests/unit/locale-parity.test.ts tests/unit/owner-agenda-query.test.ts` then `npx playwright test tests/e2e/owner-agenda.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "feat(owner): agenda date box is a DateField" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Closed dates — list, remove, add through the calendar with confirmation

**Files:**
- Create: `src/features/shops/ClosedDatesCard.tsx`
- Modify: `app/(owner)/shop.tsx` (state `closeDate`, `closeShop`, the JSX at ~lines 240–255, imports), `src/i18n/locales/{en,es,pt}.ts` (`owner.shop.closedAdd` reworded, three new keys)
- Test: `tests/unit/closed-dates-card.test.ts`; update `tests/e2e/owner-shop.web.spec.ts:149–165`

**Interfaces:**
- Consumes: `CalendarPopup` (Task 2), `ConfirmDialog` (`src/components/domain/ConfirmDialog.tsx`), `formatDateNumeric`.
- Produces: `export type ClosedDatesCardProps = { busy: boolean; dates: readonly string[]; disabled: boolean; onClose: (date: string) => void; onReopen: (date: string) => void; today: string }` and `ClosedDatesCard`. testIDs unchanged where they existed: `shop-closed-<date>`, `shop-reopen-<date>`, `shop-closed-add`; new: `shop-closed-confirm` (the dialog's confirm is `confirm-dialog-confirm`).
- i18n: `owner.shop.closedAdd` = "Add closed date" / pt "Adicionar data fechada" / es "Añadir fecha cerrada"; new `owner.shop.closedPickTitle` = "Choose the date" / pt "Escolha a data" / es "Elija la fecha"; `owner.shop.closedConfirmTitle` = "Close the shop?" / pt "Fechar a loja?" / es "¿Cerrar la tienda?"; `owner.shop.closedConfirmBody` = "The shop will be closed on {{date}} for every professional. Customers will not be able to book that day." / pt "A loja ficará fechada em {{date}} para todos os profissionais. Os clientes não poderão agendar nesse dia." / es "La tienda estará cerrada el {{date}} para todos los profesionales. Los clientes no podrán reservar ese día."; `owner.shop.closedConfirm` = "Close the shop" / pt "Fechar a loja" / es "Cerrar la tienda".

- [ ] **Step 1: Write the failing test** `tests/unit/closed-dates-card.test.ts`

```ts
import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { ClosedDatesCard } from "../../src/features/shops/ClosedDatesCard";
import i18n from "../../src/i18n";

const base = { busy: false, dates: ["2026-12-24", "2026-12-25"], disabled: false, onClose: jest.fn(), onReopen: jest.fn(), today: "2026-11-19" };
const show = (props: Partial<React.ComponentProps<typeof ClosedDatesCard>> = {}) => render(React.createElement(ClosedDatesCard, { ...base, ...props }));

describe("ClosedDatesCard", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("lists the future closed dates, each with a remove button", async () => {
    const view = await show();

    expect(view.getByTestId("shop-closed-2026-12-24")).toBeTruthy();
    await fireEvent.press(view.getByTestId("shop-reopen-2026-12-25"));

    expect(base.onReopen).toHaveBeenCalledWith("2026-12-25");
  });

  it("says so when nothing is closed", async () => {
    const view = await show({ dates: [] });

    expect(view.getByText("No closed dates.")).toBeTruthy();
  });

  it("add opens the calendar with past days and already closed days disabled", async () => {
    const view = await show();

    await fireEvent.press(view.getByTestId("shop-closed-add"));

    expect(view.getByTestId("date-picker")).toBeTruthy();
    expect(view.getByTestId("date-picker-day-2026-11-18")).toBeDisabled();
    expect(view.getByTestId("date-picker-day-2026-11-19")).not.toBeDisabled();
  });

  it("asks for confirmation before closing the picked day, and only then calls onClose", async () => {
    const view = await show({ dates: [] });

    await fireEvent.press(view.getByTestId("shop-closed-add"));
    await fireEvent.press(view.getByTestId("date-picker-day-2026-11-25"));

    expect(base.onClose).not.toHaveBeenCalled();
    expect(view.getByTestId("confirm-dialog")).toBeTruthy();
    expect(view.getByText("The shop will be closed on 2026-11-25 for every professional. Customers will not be able to book that day.")).toBeTruthy();
    await fireEvent.press(view.getByTestId("confirm-dialog-confirm"));

    expect(base.onClose).toHaveBeenCalledWith("2026-11-25");
    expect(view.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("cancelling the confirmation closes nothing", async () => {
    const view = await show({ dates: [] });

    await fireEvent.press(view.getByTestId("shop-closed-add"));
    await fireEvent.press(view.getByTestId("date-picker-day-2026-11-25"));
    await fireEvent.press(view.getByTestId("confirm-dialog-cancel"));

    expect(base.onClose).not.toHaveBeenCalled();
    expect(view.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("cannot add while the professionals have not loaded", async () => {
    const view = await show({ disabled: true });

    expect(view.getByTestId("shop-closed-add")).toBeDisabled();
  });
});
```

(Adjust the date text in the body assertion to `formatDateNumeric("2026-11-25", "en")` if English does not print ISO.)

- [ ] **Step 2: Run it to verify it fails** — `npx jest tests/unit/closed-dates-card.test.ts` — FAIL (module not found).

- [ ] **Step 3: Implement**

`src/features/shops/ClosedDatesCard.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { CalendarPopup } from "../../components/domain/CalendarPopup";
import { ConfirmDialog } from "../../components/domain/ConfirmDialog";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";

export type ClosedDatesCardProps = {
  busy: boolean;
  dates: readonly string[];
  disabled: boolean;
  onClose: (date: string) => void;
  onReopen: (date: string) => void;
  today: string;
};

// The shop's closed days (today or later): remove one, or add one through the calendar and a confirmation.
export function ClosedDatesCard({ busy, dates, disabled, onClose, onReopen, today }: ClosedDatesCardProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("owner.shop.closedTitle")}</Text>
      <Card variant="outlined">
        <View className="gap-3">
          {dates.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("owner.shop.closedNone")}</Text> : null}
          {dates.map((date) => (
            <View className="flex-row items-center justify-between gap-2" key={date} testID={`shop-closed-${date}`}>
              <Text className="text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(date, language)}</Text>
              <Button disabled={busy} label={t("owner.shop.reopen")} onPress={() => onReopen(date)} size="sm" testID={`shop-reopen-${date}`} variant="outline" />
            </View>
          ))}
          <Button disabled={busy || disabled} label={t("owner.shop.closedAdd")} onPress={() => setPicking(true)} testID="shop-closed-add" variant="outline" />
        </View>
      </Card>
      <CalendarPopup
        disabledDates={dates}
        min={today}
        onClose={() => setPicking(false)}
        onSelect={(date) => {
          setPicking(false);
          setPicked(date);
        }}
        title={t("owner.shop.closedPickTitle")}
        value={today}
        visible={picking}
      />
      <ConfirmDialog
        body={t("owner.shop.closedConfirmBody", { date: picked ? formatDateNumeric(picked, language) : "" })}
        busy={busy}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("owner.shop.closedConfirm")}
        confirmVariant="dark"
        onCancel={() => setPicked(null)}
        onConfirm={() => {
          if (picked) onClose(picked);
          setPicked(null);
        }}
        title={t("owner.shop.closedConfirmTitle")}
        visible={picked !== null}
      />
    </>
  );
}
```

`app/(owner)/shop.tsx`:
- remove `const [closeDate, setCloseDate] = useState(today);` and the `DateInput` import (keep `CepInput`, `TimeInput`); import `ClosedDatesCard`.
- `closeShop`: `mutationFn: async (date: string) => { for (const professional of closure.data?.activeProfessionals ?? []) { await createScheduleOverride(supabase, { professionalId: professional.id, endTime: null, kind: "block", localDate: date, shopId: shop!.id, startTime: null }); } }`.
- replace the block from `<Text accessibilityRole="header" …closedTitle…>` through the closing `</Card>` of the closed dates (≈ lines 241–254) with:

```tsx
            <ClosedDatesCard busy={closeShop.isPending || reopen.isPending} dates={closure.data?.dates ?? []} disabled={!closure.data} onClose={(date) => closeShop.mutate(date)} onReopen={(date) => reopen.mutate(date)} today={today} />
```

(`formatDateNumeric` and `language` stay imported in `shop.tsx` only if still used elsewhere in the file; let eslint tell you.)

E2E `tests/e2e/owner-shop.web.spec.ts`, replace the body of "the owner closes the shop on a date…" so it picks through the calendar (the mocked insert body must still equal the picked ISO date):

```ts
test("the owner closes the shop on a picked date after confirming, for every active professional", async ({ page }) => {
  const calls: Record<string, unknown> = { deletes: [], inserts: [] };
  const target = new Date(Date.now() + 40 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // ~40 days ahead: next month or the one after

  await signInAsOwner(page);
  await mockOwnerRest(page, calls);

  await page.goto("/shop");
  await expect(page.getByText("No closed dates.")).toBeVisible();
  await page.getByTestId("shop-closed-add").click();
  await expect(page.getByTestId("date-picker")).toBeVisible();
  // Past days are disabled.
  await expect(page.locator('[data-testid^="date-picker-day-"][aria-disabled="true"]').first()).toBeVisible();
  while (!(await page.getByTestId(`date-picker-day-${target}`).count())) await page.getByTestId("date-picker-next").click();
  await page.getByTestId(`date-picker-day-${target}`).click();

  // Nothing is closed until the owner confirms.
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  expect(calls.inserts).toEqual([]);
  await page.getByTestId("confirm-dialog-confirm").click();

  await expect.poll(() => calls.inserts).toMatchObject([
    { professional_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", kind: "block", local_date: target, start_time: null },
    { professional_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", kind: "block", local_date: target, start_time: null },
  ]);
});
```

(The second test in that file, "a date closed for every professional is listed and can be reopened", stays as it is: `shop-closed-<date>` / `shop-reopen-<date>` testIDs are unchanged. Confirm the shop's time zone constant in `src/lib/dates/shop-time.ts` matches `America/Sao_Paulo`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/closed-dates-card.test.ts tests/unit/day-tools.test.ts tests/unit/shop-hours.test.ts tests/unit/locale-parity.test.ts` then `npx playwright test tests/e2e/owner-shop.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "feat(shop): add closed dates through the calendar with confirmation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Owner booking form — service and professional as two steps, `DateField` for the date

**Files:**
- Modify: `app/(owner)/appointment-form.tsx`, `src/i18n/locales/{en,es,pt}.ts` (`owner.appointmentForm`)
- Test: new `tests/unit/owner-appointment-form-steps.test.ts`; update `tests/e2e/owner-appointment-form.web.spec.ts` (step counts and options)

**Interfaces:**
- Consumes: `DateField` (Task 3), `addLocalDays`, `BOOKING_DAYS_AHEAD` (`src/lib/dates/month-calendar.ts`), B's `useFocusEffect` reset.
- Produces (screen-internal): `type Step = "customer" | "date" | "professional" | "review" | "service" | "time"`; `FLOW = ["customer", "service", "professional", "date", "time", "review", "confirm"]`; new state `selectedServiceId: string | null`; testIDs `owner-service-list` (distinct services, key = service id), `owner-professional-list` (only the chosen service's professionals, key = professional-service id), `owner-form-date` (DateField), `owner-continue` (unchanged).
- i18n: `owner.appointmentForm.professionalTitle` = "Choose the professional" / pt "Escolha o profissional" / es "Elija al profesional"; `owner.appointmentForm.steps.professional` = "Professional" / "Profissional" / "Profesional". (`serviceTitle`, `steps.service`, `dateTitle` stay.)

- [ ] **Step 1: Write the failing test** `tests/unit/owner-appointment-form-steps.test.ts` (same mock header as `owner-appointment-form-reset.test.ts` from PR B, with this data):

```ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useFocusEffect: jest.fn(), useRouter: () => ({ navigate: jest.fn(), push: jest.fn() }) }));
jest.mock("../../src/lib/navigation/use-back", () => ({ useBack: () => jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/use-owner-shop-id", () => ({ useOwnerShopId: () => ({ data: "shop-1", error: null, isLoading: false }) }));
jest.mock("../../src/features/professionals/api", () => ({
  listOwnerProfessionals: jest.fn().mockResolvedValue([{ active: true, id: "p1", name: "Bruno" }, { active: true, id: "p2", name: "Caio" }]),
}));
jest.mock("../../src/features/customers/api", () => ({ listOwnerCustomers: jest.fn().mockResolvedValue([{ active: true, email: null, fullName: "Ana Customer", id: "c1" }]) }));
jest.mock("../../src/features/services/api", () => ({
  listOwnerProfessionalServices: jest.fn().mockResolvedValue([
    { active: true, id: "ps1", professionalId: "p1", serviceId: "s1" },
    { active: true, id: "ps2", professionalId: "p2", serviceId: "s1" },
    { active: true, id: "ps3", professionalId: "p1", serviceId: "s2" },
  ]),
  listOwnerServices: jest.fn().mockResolvedValue([{ active: true, id: "s1", name: "Haircut" }, { active: true, id: "s2", name: "Beard" }]),
}));

import OwnerAppointmentFormScreen from "../../app/(owner)/appointment-form";
import i18n from "../../src/i18n";

const renderForm = () =>
  render(React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }) }, React.createElement(OwnerAppointmentFormScreen)));

async function toServiceStep() {
  const view = await renderForm();

  await waitFor(() => expect(view.getByText("Ana Customer")).toBeTruthy());
  await fireEvent.press(view.getByText("Ana Customer"));

  return view;
}

describe("owner appointment form: service then professional", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("lists each service once, without professionals", async () => {
    const view = await toServiceStep();

    expect(view.getByText("Haircut")).toBeTruthy();
    expect(view.getByText("Beard")).toBeTruthy();
    expect(view.queryByText(/Bruno/)).toBeNull();
    expect(view.getByTestId("step-label")).toHaveTextContent("Step 2 of 7 · Service");
  });

  it("then offers only the professionals who offer the chosen service", async () => {
    const view = await toServiceStep();

    await fireEvent.press(view.getByText("Haircut"));
    expect(view.getByTestId("owner-professional-list")).toBeTruthy();
    expect(view.getByText("Bruno")).toBeTruthy();
    expect(view.getByText("Caio")).toBeTruthy();
    expect(view.getByTestId("step-label")).toHaveTextContent("Step 3 of 7 · Professional");
  });

  it("a service one professional offers lists only that professional", async () => {
    const view = await toServiceStep();

    await fireEvent.press(view.getByText("Beard"));

    expect(view.getByText("Bruno")).toBeTruthy();
    expect(view.queryByText("Caio")).toBeNull();
  });

  it("choosing the professional moves to the date step with a DateField limited to the booking window", async () => {
    const view = await toServiceStep();

    await fireEvent.press(view.getByText("Haircut"));
    await fireEvent.press(view.getByText("Caio"));

    expect(view.getByTestId("owner-form-date")).toBeTruthy();
    expect(view.getByTestId("owner-form-date-prev")).toBeDisabled();
    expect(view.getByTestId("step-label")).toHaveTextContent("Step 4 of 7 · Date");
  });
});
```

(`step-label` is `StepBar`'s testID used by the e2e specs. If RNTL cannot read it, assert on `view.getByText("Choose the professional")` / the step names instead.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/unit/owner-appointment-form-steps.test.ts`
Expected: FAIL (service list still shows "Bruno · Haircut").

- [ ] **Step 3: Implement** in `app/(owner)/appointment-form.tsx`

- imports: remove `DateStep` from `../../src/features/availability/steps` (keep `TimeStep`); add `import { DateField } from "../../src/components/ui/DateField";`, `import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";`, `import { BOOKING_DAYS_AHEAD } from "../../src/lib/dates/month-calendar";`.
- `type Step = "customer" | "date" | "professional" | "review" | "service" | "time";` and `const FLOW = ["customer", "service", "professional", "date", "time", "review", "confirm"] as const;`.
- new state next to the others: `const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);`; add `setSelectedServiceId(null);` to B's `useFocusEffect` reset.
- below `choices`:

```tsx
  // Each service once (a service several professionals offer is one entry), in the order the catalogue lists them.
  const serviceOptions = useMemo(() => {
    const seen = new Map<string, string>();

    for (const { service } of choices) if (service && !seen.has(service.id)) seen.set(service.id, service.name);

    return [...seen].map(([id, name]) => ({ id, name }));
  }, [choices]);
  const professionalOptions = choices.filter(({ service }) => service?.id === selectedServiceId);
```

- the `service` step block becomes the service list, and a new `professional` block follows:

```tsx
            {step === "service" ? (
              <RadioBlock
                items={serviceOptions.map((option) => ({
                  key: option.id,
                  label: option.name,
                  onPress: () => {
                    setSelectedServiceId(option.id);
                    setSelectedProfessionalServiceId(null);
                    setSelectedStartsAt(null);
                    go("professional");
                  },
                  selected: option.id === selectedServiceId,
                }))}
                testID="owner-service-list"
              />
            ) : null}

            {step === "professional" ? (
              <RadioBlock
                items={professionalOptions.map(({ professional, professionalService }) => ({
                  key: professionalService.id,
                  label: professional?.name ?? "",
                  onPress: () => {
                    setSelectedProfessionalServiceId(professionalService.id);
                    setSelectedStartsAt(null);
                    go("date");
                  },
                  selected: professionalService.id === selectedProfessionalServiceId,
                }))}
                testID="owner-professional-list"
              />
            ) : null}
```

- the date step:

```tsx
            {step === "date" ? (
              <>
                <DateField label={t("common.localDate")} max={addLocalDays(today, BOOKING_DAYS_AHEAD)} min={today} onChange={(date) => { setLocalDate(date); setSelectedStartsAt(null); }} testID="owner-form-date" value={localDate} />
                <Button label={t("book.continue")} onPress={() => go("time")} size="lg" testID="owner-continue" />
              </>
            ) : null}
```

- i18n keys from Interfaces above in all three locales (`owner.appointmentForm.professionalTitle`, `steps.professional`). `title = t(\`owner.appointmentForm.${step}Title\`)` then resolves `professionalTitle`.

E2E `tests/e2e/owner-appointment-form.web.spec.ts` (update the happy-path test and the other two that click `option-bs1`): after the customer, the service option is `option-<serviceId from the file's mock>`; add the professional click. For example, in the happy path replace lines "Step 2 of 6 · Service … Step 3 of 6 · Date … month-calendar visible" by:

```ts
  await expect(page.getByTestId("step-label")).toHaveText("Step 2 of 7 · Service");
  await expect(page.getByTestId("option-s1")).toContainText("Cut");
  await expect(page.getByTestId("option-s1")).not.toContainText("Bruno");
  await page.getByTestId("option-s1").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 3 of 7 · Professional");
  await expect(page.getByTestId("option-bs1")).toContainText("Bruno Professional");
  await page.getByTestId("option-bs1").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 4 of 7 · Date");
  await expect(page.getByTestId("owner-form-date")).toBeVisible();
  await page.getByTestId("owner-continue").click();

  await expect(page.getByTestId("step-label")).toHaveText("Step 5 of 7 · Time");
```

and bump the following labels (Time → 5, Review → 6 of 7; "a time taken meanwhile returns to the time step" → "Step 5 of 7 · Time"; the back-navigation test: customer → service → professional → "Step 4 of 7 · Date", back → "Step 3 of 7 · Professional"). Replace `s1` with the service id the file's mock really uses (`rtk grep -n "service_id\|id: \"s" tests/e2e/owner-appointment-form.web.spec.ts`). Add one test: picking the date through the pop-up and with the arrow:

```ts
test("the date step uses the DateField: arrow, calendar, and no past days", async ({ page }) => {
  await signInAsOwner(page);
  await mockOwnerRest(page, {});

  await page.goto("/appointment-form");
  await page.getByTestId("option-c1").click();
  await page.getByTestId("option-s1").click();
  await page.getByTestId("option-bs1").click();

  await expect(page.getByTestId("owner-form-date-prev")).toBeDisabled();
  await page.getByTestId("owner-form-date-next").click();
  await page.getByTestId("owner-form-date").click();
  await expect(page.getByTestId("date-picker")).toBeVisible();
  await expect(page.locator('[data-testid^="date-picker-day-"][aria-disabled="true"]').first()).toBeVisible();
  await page.getByTestId("date-picker-close").click();
  await page.getByTestId("owner-continue").click();
  await expect(page.getByTestId("step-label")).toHaveText("Step 5 of 7 · Time");
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest tests/unit/owner-appointment-form-steps.test.ts tests/unit/owner-appointment-form-reset.test.ts tests/unit/locale-parity.test.ts tests/unit/booking-steps.test.ts` then `npx playwright test tests/e2e/owner-appointment-form.web.spec.ts --config playwright.chrome.config.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck && ./node_modules/.bin/eslint app src tests scripts
git add -A app src tests
git commit -m "feat(owner): booking form picks service, then professional, with a DateField" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Final gate, browser checks, PR handoff

- [ ] **Step 1: Whole-suite gates**

```bash
npm run typecheck; echo typecheck_exit=$?
npm run lint; echo lint_exit=$?
npx jest --runInBand
```

Expected: both exits 0 (read the real output), Jest green. Fix, commit, then **re-run all three after the last commit**.

- [ ] **Step 2: Browser verification** (system Chrome, `.env.local` moved aside, mobile width 390x844, screenshots outside the repo and viewed): owner Agenda in day, week and month view (arrows step a day / week / month; computed text of the date button changes accordingly; the pop-up opens on tap and closes with X, tap outside and a day pick; a past day is selectable); closed dates (list with remove buttons, Add closed date → calendar with past days dimmed → confirmation text with the formatted date → list updates); the booking form (service list without professional names, professional list limited to the service, date step with disabled previous arrow and dimmed past days in the pop-up). Computed-style checks: the selected day cell background equals the ink token (`getComputedStyle(...).backgroundColor` = `rgb(...)` of `--c-ink`), the pop-up card background equals `--c-surface`, the pop-up is centred (`getBoundingClientRect` centre within 2px of the viewport centre). Run the touched specs: `npx playwright test tests/e2e/owner-agenda.web.spec.ts tests/e2e/owner-shop.web.spec.ts tests/e2e/owner-appointment-form.web.spec.ts tests/e2e/swipe.web.spec.ts tests/e2e/professional-booking.web.spec.ts --config playwright.chrome.config.ts` (the last two prove the inline `MonthCalendar` flows are unaffected).

- [ ] **Step 3: Hand off** — push, open the PR, bind with `get_status`/`bind_pr`, turn on Auto-fix, never auto-merge (only when ordered; this plan itself does not push).
