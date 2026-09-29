import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

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

// Drives the responder handlers the way the responder system does: record the start,
// ask whether to claim the move, then release.
async function drag(view: Awaited<ReturnType<typeof renderCalendar>>, from: [number, number], to: [number, number]) {
  const props = view.getByTestId("month-calendar").props;
  const at = ([pageX, pageY]: [number, number]) => ({ nativeEvent: { pageX, pageY } });

  props.onStartShouldSetResponderCapture(at(from));
  const claimed = props.onMoveShouldSetResponderCapture(at(to));

  await act(async () => props.onResponderRelease(at(to)));

  return claimed;
}

describe("MonthCalendar swipe", () => {
  it("goes to the next month when dragged left", async () => {
    const view = await renderCalendar();

    expect(await drag(view, [300, 200], [180, 205])).toBe(true);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("goes back when dragged right", async () => {
    const view = await renderCalendar();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    await drag(view, [100, 200], [230, 200]);

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("stops at the last month of the window and at the current month", async () => {
    const view = await renderCalendar();

    await drag(view, [100, 200], [230, 200]);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");

    await drag(view, [300, 200], [180, 200]);
    await drag(view, [300, 200], [180, 200]);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("ignores a gesture that never started inside the calendar", async () => {
    const view = await renderCalendar();
    const props = view.getByTestId("month-calendar").props;
    const at = (pageX: number, pageY: number) => ({ nativeEvent: { pageX, pageY } });

    expect(props.onMoveShouldSetResponderCapture(at(-100, 0))).toBe(false);
    await act(async () => props.onResponderRelease(at(-100, 0)));

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("forgets the start once a gesture is released", async () => {
    const view = await renderCalendar();
    const props = view.getByTestId("month-calendar").props;

    await drag(view, [300, 200], [180, 200]);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");

    await fireEvent.press(view.getByTestId("month-calendar-prev"));
    await act(async () => props.onResponderRelease({ nativeEvent: { pageX: 0, pageY: 200 } }));

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("ignores a mostly vertical drag and a short one", async () => {
    const view = await renderCalendar();

    expect(await drag(view, [300, 100], [250, 300])).toBe(false);
    expect(await drag(view, [300, 200], [280, 200])).toBe(false);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });
});
