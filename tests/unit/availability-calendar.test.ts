import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

jest.mock("../../src/features/availability/use-unavailable-dates", () => ({ useUnavailableDates: jest.fn() }));

import { AvailabilityCalendar } from "../../src/features/availability/AvailabilityCalendar";
import { useUnavailableDates } from "../../src/features/availability/use-unavailable-dates";
import i18n from "../../src/i18n";

const show = (props: { onSelectDate?: () => void; professionalId?: string } = {}) =>
  render(
    React.createElement(
      GestureHandlerRootView,
      { style: { flex: 1 } },
      React.createElement(AvailabilityCalendar, { onSelectDate: jest.fn(), selectedDate: "2026-09-28", today: "2026-09-28", ...props }),
    ),
  );

describe("AvailabilityCalendar", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("dims what the hook returns for the chosen professional and explains a tap on it", async () => {
    const onSelectDate = jest.fn();
    jest.mocked(useUnavailableDates).mockReturnValue(["2026-09-30"]);
    const view = await show({ onSelectDate, professionalId: "p1" });

    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-30"));

    expect(onSelectDate).not.toHaveBeenCalled();
    expect(view.getByText("Unavailable on this date")).toBeTruthy();
    expect(useUnavailableDates).toHaveBeenCalledWith("p1", "2026-09");
  });

  it("follows the month the calendar shows", async () => {
    jest.mocked(useUnavailableDates).mockReturnValue([]);
    const view = await show({ professionalId: "p1" });

    await fireEvent.press(view.getByTestId("month-calendar-next"));

    expect(useUnavailableDates).toHaveBeenLastCalledWith("p1", "2026-10");
  });

  it("without a professional it asks for nothing and dims nothing", async () => {
    jest.mocked(useUnavailableDates).mockReturnValue([]);
    const view = await show();

    expect(useUnavailableDates).toHaveBeenCalledWith("", "2026-09");
    expect(view.getByTestId("month-calendar-day-2026-09-30").props.className).not.toContain("opacity-40");
  });
});
