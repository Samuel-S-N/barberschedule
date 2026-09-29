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

  it("moves off a month that became past when today rolls over", async () => {
    const view = await renderCalendar();

    await view.rerender(React.createElement(MonthCalendar, { onSelectDate: jest.fn(), selectedDate: "2026-10-01", today: "2026-10-01" }));

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
    expect(view.getByTestId("month-calendar-prev")).toBeDisabled();
  });

  it("marks the selected day for assistive technology", async () => {
    const view = await renderCalendar(jest.fn(), "2026-09-30");

    expect(view.getByTestId("month-calendar-day-2026-09-30").props.accessibilityState).toMatchObject({ selected: true });
    expect(view.getByTestId("month-calendar-day-2026-09-29").props.accessibilityState).toMatchObject({ selected: false });
  });

  it("labels the title and month buttons in the device language", async () => {
    const i18n = jest.requireActual("../../src/i18n").default;

    await i18n.changeLanguage("pt");
    try {
      const view = await renderCalendar();

      expect(view.getByTestId("month-calendar-title")).toHaveTextContent("Setembro de 2026");
      expect(view.getByTestId("month-calendar-next").props.accessibilityLabel).toBe("Próximo mês");
      expect(view.getByTestId("month-calendar-prev").props.accessibilityLabel).toBe("Mês anterior");
      view.unmount();
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
