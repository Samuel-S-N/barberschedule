import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { CalendarStrip } from "../../src/components/domain/CalendarStrip";

const days = [
  { date: "2026-08-18", weekdayLabel: "THU", dayNumber: "18", hasAppointment: true },
  { date: "2026-08-19", weekdayLabel: "FRI", dayNumber: "19" },
];

describe("CalendarStrip", () => {
  it("renders every day's weekday label and number", async () => {
    const view = await render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate: jest.fn(),
      }),
    );

    expect(view.getByText("THU")).toBeTruthy();
    expect(view.getByText("18")).toBeTruthy();
    expect(view.getByText("FRI")).toBeTruthy();
    expect(view.getByText("19")).toBeTruthy();
  });

  it("calls onSelectDate with the tapped day's date", async () => {
    const onSelectDate = jest.fn();
    const view = await render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate,
      }),
    );

    await fireEvent.press(view.getByTestId("calendar-strip-day-2026-08-19"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-08-19");
  });

  it("marks only the selected day as accessibilityState.selected", async () => {
    const view = await render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate: jest.fn(),
      }),
    );

    expect(view.getByTestId("calendar-strip-day-2026-08-18").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(view.getByTestId("calendar-strip-day-2026-08-19").props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    );
  });

  it("renders an appointment-indicator dot only for days that have one", async () => {
    const view = await render(
      React.createElement(CalendarStrip, {
        days, selectedDate: "2026-08-18", onSelectDate: jest.fn(),
      }),
    );

    expect(view.queryByTestId("calendar-strip-day-2026-08-18-dot")).toBeTruthy();
    expect(view.queryByTestId("calendar-strip-day-2026-08-19-dot")).toBeNull();
  });
});
