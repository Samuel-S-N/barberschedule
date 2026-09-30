import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
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

// The swipe is a native pan (inside the Android pager a JS responder is cancelled after ~8 dp) that moves a strip of
// month pages with the finger. The strip's translateX is 0 on the first month and -PAGE on the second.
const PAGE = 300;

async function renderMeasured() {
  const view = await renderCalendar();

  await act(async () => {
    fireEvent(view.getByTestId("month-calendar-viewport"), "layout", { nativeEvent: { layout: { height: 300, width: PAGE, x: 0, y: 0 } } });
  });

  return view;
}

function stripX(view: Awaited<ReturnType<typeof renderMeasured>>) {
  const style = StyleSheet.flatten(view.getByTestId("month-pages").props.style) as { transform: { translateX: number }[] };

  return style.transform[0].translateX;
}

// Plays a whole pan the way gesture-handler reports it; `end` is how it finishes.
async function drag(translationX: number, options: { end?: "end" | "cancel"; velocityX?: number } = {}) {
  const { end = "end", velocityX = 0 } = options;

  await act(async () => {
    fireGestureHandler(getByGestureTestId("month-swipe"), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: 0, translationY: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX, translationY: 4, velocityX },
      { state: end === "end" ? State.END : State.CANCELLED, translationX, translationY: 4, velocityX },
    ]);
  });
}

// fireGestureHandler always closes the gesture, so the middle of a drag is reached through the gesture's own callbacks.
async function dragMidway(translationX: number) {
  const { handlers } = getByGestureTestId("month-swipe") as unknown as {
    handlers: { onStart: (event: unknown) => void; onUpdate: (event: unknown) => void };
  };

  await act(async () => {
    handlers.onStart({ translationX: 0 });
    handlers.onUpdate({ translationX });
  });
}

describe("MonthCalendar swipe", () => {
  it("lays the months side by side once it is measured", async () => {
    const view = await renderMeasured();

    expect(view.getByTestId("month-calendar-day-2026-09-30")).toBeTruthy();
    // The next month is already there, off screen and hidden from assistive technology.
    expect(view.getByTestId("month-calendar-day-2026-10-05", { includeHiddenElements: true })).toBeTruthy();
    expect(view.queryByTestId("month-calendar-day-2026-10-05")).toBeNull();
    expect(stripX(view)).toBe(0);
  });

  it("follows the finger while dragging", async () => {
    const view = await renderMeasured();

    await dragMidway(-100);

    expect(stripX(view)).toBe(-100);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("finishes the change to the next month past 30% of a page", async () => {
    const view = await renderMeasured();

    await drag(-120);

    expect(stripX(view)).toBe(-PAGE);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
    expect(view.getByTestId("month-calendar-next")).toBeDisabled();
  });

  it("snaps back from a short drag", async () => {
    const view = await renderMeasured();

    await drag(-40);

    expect(stripX(view)).toBe(0);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("changes month on a quick flick even when the drag is short", async () => {
    const view = await renderMeasured();

    await drag(-30, { velocityX: -900 });

    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("goes back to the previous month when dragged right", async () => {
    const view = await renderMeasured();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    await drag(130);

    expect(stripX(view)).toBe(0);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("resists past the first month and stays there", async () => {
    const view = await renderMeasured();

    await dragMidway(100);
    expect(stripX(view)).toBe(25);

    await drag(100);
    expect(stripX(view)).toBe(0);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("resists past the last month and stays there", async () => {
    const view = await renderMeasured();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    await dragMidway(-100);
    expect(stripX(view)).toBe(-PAGE - 25);

    await drag(-100);
    expect(stripX(view)).toBe(-PAGE);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("October 2026");
  });

  it("snaps back when the gesture is cancelled", async () => {
    const view = await renderMeasured();

    await drag(-120, { end: "cancel" });

    expect(stripX(view)).toBe(0);
    expect(view.getByTestId("month-calendar-title")).toHaveTextContent("September 2026");
  });

  it("slides the strip when a month arrow is pressed", async () => {
    const view = await renderMeasured();

    await fireEvent.press(view.getByTestId("month-calendar-next"));
    expect(stripX(view)).toBe(-PAGE);

    await fireEvent.press(view.getByTestId("month-calendar-prev"));
    expect(stripX(view)).toBe(0);
  });

  it("still selects a day of the month in view", async () => {
    const onSelectDate = jest.fn();
    const view = await (async () => {
      const rendered = await renderCalendar(onSelectDate);

      await act(async () => {
        fireEvent(rendered.getByTestId("month-calendar-viewport"), "layout", { nativeEvent: { layout: { height: 300, width: PAGE, x: 0, y: 0 } } });
      });

      return rendered;
    })();

    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-30"));

    expect(onSelectDate).toHaveBeenCalledWith("2026-09-30");
  });
});
