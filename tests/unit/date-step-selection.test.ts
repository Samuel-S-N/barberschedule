import { fireEvent, render } from "@testing-library/react-native";
import React, { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

jest.mock("../../src/features/availability/use-unavailable-dates", () => ({ useUnavailableDates: jest.fn() }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));

import { DateStep } from "../../src/features/availability/steps";
import { useUnavailableDates } from "../../src/features/availability/use-unavailable-dates";
import i18n from "../../src/i18n";

// today = Mon 2026-09-28, so the bookable window ends on 2026-10-28.
function Step({ onContinue }: { onContinue: () => void }) {
  const [localDate, setLocalDate] = useState("2026-09-28");

  return React.createElement(DateStep, { localDate, onChange: setLocalDate, onContinue, professionalId: "p1", testID: "continue", today: "2026-09-28" });
}

const show = (onContinue = jest.fn()) => render(React.createElement(GestureHandlerRootView, { style: { flex: 1 } }, React.createElement(Step, { onContinue })));

describe("DateStep with the professional's unavailable days", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  afterEach(() => jest.clearAllMocks());

  it("today unavailable: nothing is selected and Continue is disabled until a free day is tapped", async () => {
    jest.mocked(useUnavailableDates).mockReturnValue(["2026-09-28"]);
    const onContinue = jest.fn();
    const view = await show(onContinue);

    expect(view.getByTestId("continue")).toBeDisabled();
    expect(view.getByTestId("month-calendar-day-2026-09-28").props.className).not.toContain("bg-ink");

    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-29"));

    expect(view.getByTestId("continue")).not.toBeDisabled();
    expect(view.getByTestId("month-calendar-day-2026-09-29").props.className).toContain("bg-ink");
    await fireEvent.press(view.getByTestId("continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("tapping the dimmed today does not select it and Continue stays disabled", async () => {
    jest.mocked(useUnavailableDates).mockReturnValue(["2026-09-28"]);
    const view = await show();

    await fireEvent.press(view.getByTestId("month-calendar-day-2026-09-28"));

    expect(view.getByTestId("continue")).toBeDisabled();
    expect(view.getByText("Unavailable on this date")).toBeTruthy();
  });

  it("today available: unchanged, today selected and Continue enabled", async () => {
    jest.mocked(useUnavailableDates).mockReturnValue(["2026-09-30"]);
    const view = await show();

    expect(view.getByTestId("continue")).not.toBeDisabled();
    expect(view.getByTestId("month-calendar-day-2026-09-28").props.className).toContain("bg-ink");
  });
});
