import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { MonthCalendar } from "../../src/components/domain/MonthCalendar";
import i18n from "../../src/i18n";

// today = Mon 2026-09-28, so the bookable window ends on 2026-10-28.
function renderCalendar(props: { onSelectDate: () => void; onVisibleMonthChange?: (month: string) => void; unavailableDates?: readonly string[] }) {
  return render(React.createElement(GestureHandlerRootView, { style: { flex: 1 } }, React.createElement(MonthCalendar, { selectedDate: "2026-09-28", today: "2026-09-28", ...props })));
}

describe("MonthCalendar unavailable days", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("a dimmed day is not selectable and explains itself when tapped", async () => {
    const onSelectDate = jest.fn();
    const view = await renderCalendar({ onSelectDate, unavailableDates: ["2026-09-30"] });

    expect(view.queryByTestId("month-calendar-unavailable-message")).toBeNull();
    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-30"));

    expect(onSelectDate).not.toHaveBeenCalled();
    expect(view.getByTestId("month-calendar-unavailable-message")).toBeTruthy();
    expect(view.getByText("Unavailable on this date")).toBeTruthy();
  });

  it("a normal day still selects and shows no message", async () => {
    const onSelectDate = jest.fn();
    const view = await renderCalendar({ onSelectDate, unavailableDates: ["2026-09-30"] });

    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-29"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-29");
    expect(view.queryByTestId("month-calendar-unavailable-message")).toBeNull();
  });

  it("a dimmed day reports disabled to accessibility, keeps receiving the press (no native disabled) and is visibly dimmed", async () => {
    const view = await renderCalendar({ onSelectDate: jest.fn(), unavailableDates: ["2026-09-30"] });
    const day = view.getByTestId("month-calendar-day-2026-09-30");

    expect(day.props.accessibilityState).toMatchObject({ disabled: true });
    expect(day.props.disabled).toBeFalsy();
    expect(day.props.className).toContain("opacity-40");
    expect(view.getByTestId("month-calendar-day-2026-09-29").props.className).not.toContain("opacity-40");
  });

  it("days outside the booking window stay natively disabled (not part of the unavailable list)", async () => {
    const view = await renderCalendar({ onSelectDate: jest.fn(), unavailableDates: [] });

    expect(view.getByTestId("month-calendar-day-2026-09-27")).toBeDisabled();
  });

  it("reports the visible month, at first and after paging", async () => {
    const onVisibleMonthChange = jest.fn();
    const view = await renderCalendar({ onSelectDate: jest.fn(), onVisibleMonthChange });

    expect(onVisibleMonthChange).toHaveBeenLastCalledWith("2026-09");
    await fireEvent.press(view.getByTestId("month-calendar-next"));

    expect(onVisibleMonthChange).toHaveBeenLastCalledWith("2026-10");
  });
});
