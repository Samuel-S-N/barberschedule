import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";

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

// Plays the native pan the way gesture-handler reports it: began, active, then ended with the total translation.
// A native gesture is used because inside the Android pager a JS responder is cancelled after ~8 dp.
async function drag(translationX: number, translationY = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId("month-swipe"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: 0, translationY: 0 },
      { state: State.ACTIVE, translationX, translationY },
      { state: State.END, translationX, translationY },
    ]);
  });
}

describe("MonthCalendar swipe", () => {
  it("goes to the next month when dragged left", async () => {
    const view = await renderCalendar();

    await drag(-120, 5);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("goes back when dragged right", async () => {
    const view = await renderCalendar();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    await drag(130);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("stops at the current month and at the last month of the window", async () => {
    const view = await renderCalendar();

    await drag(130);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");

    await drag(-120);
    await drag(-120);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("ignores a short drag and a mostly vertical one", async () => {
    const view = await renderCalendar();

    await drag(-30);
    await drag(-80, 60);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("does nothing when the gesture is cancelled", async () => {
    const view = await renderCalendar();

    await act(async () => {
      fireGestureHandler(getByGestureTestId("month-swipe"), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: -120, translationY: 0 },
        { state: State.CANCELLED, translationX: -120, translationY: 0 },
      ]);
    });

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });
});
