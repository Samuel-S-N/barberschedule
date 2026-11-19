import { renderHook } from "@testing-library/react-native";

jest.mock("../../src/features/availability/use-unavailable-dates", () => ({ useUnavailableDates: jest.fn() }));

import { useAvailabilitySelection } from "../../src/features/availability/use-availability-selection";
import { useUnavailableDates } from "../../src/features/availability/use-unavailable-dates";

const TODAY = "2026-09-28";

const unavailable = (dates: string[]) => jest.mocked(useUnavailableDates).mockReturnValue(dates);

describe("useAvailabilitySelection", () => {
  afterEach(() => jest.clearAllMocks());

  it("today available: today stays selected and Continue is allowed", async () => {
    unavailable(["2026-09-30"]);
    const { result } = await renderHook(() => useAvailabilitySelection("p1", TODAY, jest.fn()));

    expect(result.current.calendar.selectedDate).toBe(TODAY);
    expect(result.current.canContinue).toBe(true);
    expect(result.current.calendar.unavailableDates).toEqual(["2026-09-30"]);
  });

  it("today unavailable: no day is selected and Continue is not allowed", async () => {
    unavailable([TODAY]);
    const { result } = await renderHook(() => useAvailabilitySelection("p1", TODAY, jest.fn()));

    expect(result.current.calendar.selectedDate).toBe("");
    expect(result.current.canContinue).toBe(false);
  });

  it("keeps today selected while the unavailable days are still loading, then clears it if it turns out unavailable", async () => {
    unavailable([]);
    const { rerender, result } = await renderHook(() => useAvailabilitySelection("p1", TODAY, jest.fn()));

    expect(result.current.calendar.selectedDate).toBe(TODAY);
    expect(result.current.canContinue).toBe(true);

    unavailable([TODAY]);
    await rerender({});

    expect(result.current.calendar.selectedDate).toBe("");
    expect(result.current.canContinue).toBe(false);
  });

  it("tapping a free day selects it (reported to the parent) and allows Continue", async () => {
    unavailable([TODAY]);
    const onChange = jest.fn();
    let localDate = TODAY;
    const { rerender, result } = await renderHook(() => useAvailabilitySelection("p1", localDate, onChange));

    result.current.calendar.onSelectDate("2026-09-29");
    localDate = "2026-09-29";
    await rerender({});

    expect(onChange).toHaveBeenCalledWith("2026-09-29");
    expect(result.current.calendar.selectedDate).toBe("2026-09-29");
    expect(result.current.canContinue).toBe(true);
  });

  it("a day the user picked is never cleared afterwards just because the data refetches", async () => {
    unavailable([TODAY]);
    let localDate = TODAY;
    const { rerender, result } = await renderHook(() => useAvailabilitySelection("p1", localDate, jest.fn()));

    result.current.calendar.onSelectDate("2026-09-29");
    localDate = "2026-09-29";
    unavailable([TODAY, "2026-09-29"]);
    await rerender({});

    expect(result.current.calendar.selectedDate).toBe("2026-09-29");
    expect(result.current.canContinue).toBe(true);
  });

  it("without a professional nothing is dimmed and nothing is cleared", async () => {
    unavailable([]);
    const { result } = await renderHook(() => useAvailabilitySelection(undefined, TODAY, jest.fn()));

    expect(useUnavailableDates).toHaveBeenCalledWith("", "2026-09");
    expect(result.current.canContinue).toBe(true);
  });

  it("follows the month the calendar shows", async () => {
    unavailable([]);
    const { result, rerender } = await renderHook(() => useAvailabilitySelection("p1", TODAY, jest.fn()));

    result.current.calendar.onVisibleMonthChange("2026-10");
    await rerender({});

    expect(useUnavailableDates).toHaveBeenLastCalledWith("p1", "2026-10");
  });

  it("today unavailable: swiping two months away keeps today cleared and Continue disabled, and swiping back keeps it so", async () => {
    // The visible window (month +-1) no longer holds today's month after two swipes; the hook must not depend on it for the decision.
    jest.mocked(useUnavailableDates).mockImplementation((_professional, month) => (month === "2026-09" || month === "2026-08" || month === "2026-10" ? [TODAY] : []));
    const { rerender, result } = await renderHook(() => useAvailabilitySelection("p1", TODAY, jest.fn()));

    expect(result.current.calendar.selectedDate).toBe("");
    expect(result.current.canContinue).toBe(false);

    result.current.calendar.onVisibleMonthChange("2026-10");
    await rerender({});
    result.current.calendar.onVisibleMonthChange("2026-11");
    await rerender({});
    result.current.calendar.onVisibleMonthChange("2026-12");
    await rerender({});

    expect(useUnavailableDates).toHaveBeenCalledWith("p1", "2026-09");
    expect(useUnavailableDates).toHaveBeenLastCalledWith("p1", "2026-12");
    expect(result.current.calendar.selectedDate).toBe("");
    expect(result.current.canContinue).toBe(false);
    // Dimming still follows the month in view.
    expect(result.current.calendar.unavailableDates).toEqual([]);

    result.current.calendar.onVisibleMonthChange("2026-09");
    await rerender({});

    expect(result.current.calendar.selectedDate).toBe("");
    expect(result.current.canContinue).toBe(false);
    expect(result.current.calendar.unavailableDates).toEqual([TODAY]);
  });
});
