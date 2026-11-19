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
