import { fireEvent, render } from "@testing-library/react-native";
import React from "react";

import { DateField } from "../../src/components/ui/DateField";
import i18n from "../../src/i18n";

const show = async (props: Partial<React.ComponentProps<typeof DateField>> = {}) => {
  const onChange = jest.fn();
  const view = await render(React.createElement(DateField, { label: "Local date", onChange, testID: "df", value: "2026-10-15", ...props }));

  return { onChange, view };
};

describe("DateField", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows the label and the formatted date", async () => {
    const { view } = await show();

    expect(view.getByText("Local date")).toBeTruthy();
    expect(view.getByText("2026-10-15")).toBeTruthy();
  });

  it("the arrows move one day without opening the calendar", async () => {
    const { onChange, view } = await show();

    await fireEvent.press(view.getByTestId("df-next"));
    await fireEvent.press(view.getByTestId("df-prev"));

    expect(onChange).toHaveBeenNthCalledWith(1, "2026-10-16");
    expect(onChange).toHaveBeenNthCalledWith(2, "2026-10-14");
    expect(view.queryByTestId("date-picker")).toBeNull();
  });

  it("steps by a week or by a month when asked", async () => {
    const week = await show({ step: "week" });
    await fireEvent.press(week.view.getByTestId("df-next"));
    expect(week.onChange).toHaveBeenCalledWith("2026-10-22");

    const month = await show({ step: "month", value: "2026-01-31" });
    await fireEvent.press(month.view.getByTestId("df-next"));
    expect(month.onChange).toHaveBeenCalledWith("2026-02-28");
  });

  it("names the arrows after the step", async () => {
    const { view } = await show({ step: "week" });

    expect(view.getByLabelText("Previous week")).toBeTruthy();
    expect(view.getByLabelText("Next week")).toBeTruthy();
  });

  it("opens the calendar on tap, selects a day and closes", async () => {
    const { onChange, view } = await show();

    await fireEvent.press(view.getByTestId("df"));
    expect(view.getByTestId("date-picker")).toBeTruthy();
    await fireEvent.press(view.getByTestId("date-picker-day-2026-10-27"));

    expect(onChange).toHaveBeenCalledWith("2026-10-27");
    expect(view.queryByTestId("date-picker")).toBeNull();
  });

  it("disables the arrows at min and max", async () => {
    const { view } = await show({ max: "2026-10-16", min: "2026-10-15" });

    expect(view.getByTestId("df-prev")).toBeDisabled();
    expect(view.getByTestId("df-next")).not.toBeDisabled();
  });

  it("passes min and max to the calendar", async () => {
    const { view } = await show({ min: "2026-10-10" });

    await fireEvent.press(view.getByTestId("df"));

    expect(view.getByTestId("date-picker-day-2026-10-09")).toBeDisabled();
  });
});
