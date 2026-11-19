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

    expect(view.getByText("October 2026")).toBeTruthy();
    await fireEvent.press(view.getByTestId("date-picker-day-2026-10-20"));

    expect(base.onSelect).toHaveBeenCalledWith("2026-10-20");
  });

  it("changes month with the arrows", async () => {
    const view = await show();

    await fireEvent.press(view.getByTestId("date-picker-next"));
    expect(view.getByText("November 2026")).toBeTruthy();
    await fireEvent.press(view.getByTestId("date-picker-prev"));
    await fireEvent.press(view.getByTestId("date-picker-prev"));
    expect(view.getByText("September 2026")).toBeTruthy();
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

    expect(view.getByText("December 2026")).toBeTruthy();
  });
});
