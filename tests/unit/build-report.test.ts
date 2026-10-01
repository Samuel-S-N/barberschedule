import {
  dailySeries, daysBetween, percentChange, previousRange, sumDays, topServices, weekdayCounts,
  type ReportDay,
} from "../../src/features/reports/build-report";

const day = (date: string, over: Partial<ReportDay> = {}): ReportDay => ({
  cancelled: 0, completed: 0, date, earningsCents: 0, noShow: 0, upcoming: 0, ...over,
});

describe("ranges", () => {
  it("counts days inclusively", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(7);
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("previous range has the same length and ends the day before", () => {
    expect(previousRange("2026-10-01", "2026-10-07")).toEqual({ end: "2026-09-30", start: "2026-09-24" });
    expect(previousRange("2026-10-01", "2026-10-01")).toEqual({ end: "2026-09-30", start: "2026-09-30" });
  });
});

describe("totals and deltas", () => {
  it("sums days and computes the cancellation rate from closed appointments", () => {
    const totals = sumDays([
      day("2026-10-01", { cancelled: 1, completed: 6, earningsCents: 1000, noShow: 1, upcoming: 2 }),
      day("2026-10-02", { completed: 2, earningsCents: 500 }),
    ]);

    expect(totals).toEqual({ cancelled: 1, cancellationRate: 0.2, completed: 8, earningsCents: 1500, noShow: 1, upcoming: 2 });
  });

  it("has no rate when nothing was closed", () => {
    expect(sumDays([day("2026-10-01", { upcoming: 3 })]).cancellationRate).toBeNull();
    expect(sumDays([]).cancellationRate).toBeNull();
  });

  it("rounds the percent change and returns null against a zero baseline", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(80, 100)).toBe(-20);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe("series", () => {
  it("zero-fills every day in a short range", () => {
    const points = dailySeries([day("2026-10-02", { earningsCents: 700 })], "2026-10-01", "2026-10-03", (d) => d.earningsCents);

    expect(points.map((p) => p.value)).toEqual([0, 700, 0]);
    expect(points.map((p) => p.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
  });

  it("groups by week when the range is longer than 31 days", () => {
    const points = dailySeries(
      [day("2026-10-01", { earningsCents: 100 }), day("2026-10-07", { earningsCents: 50 }), day("2026-10-08", { earningsCents: 10 })],
      "2026-10-01", "2026-12-29", (d) => d.earningsCents,
    );

    expect(points).toHaveLength(13);
    expect(points[0]).toEqual({ from: "2026-10-01", key: "2026-10-01", value: 150 });
    expect(points[1].value).toBe(10);
  });

  it("counts completed appointments per weekday, Monday first", () => {
    // 2026-10-05 is a Monday, 2026-10-11 a Sunday
    expect(weekdayCounts([day("2026-10-05", { completed: 2 }), day("2026-10-11", { completed: 3 }), day("2026-10-12", { completed: 1 })]))
      .toEqual([3, 0, 0, 0, 0, 0, 3]);
  });
});

describe("topServices", () => {
  const services = [
    { completed: 5, name: "Cut", serviceId: "a" }, { completed: 1, name: "Dye", serviceId: "e" },
    { completed: 3, name: "Beard", serviceId: "b" }, { completed: 2, name: "Shave", serviceId: "c" },
    { completed: 2, name: "Kids", serviceId: "d" }, { completed: 1, name: "Wax", serviceId: "f" },
  ];

  it("keeps the top N and folds the tail into other", () => {
    const items = topServices(services, 4);

    expect(items.map((i) => i.key)).toEqual(["a", "b", "d", "c", "other"]);
    expect(items.at(-1)).toEqual({ key: "other", name: "", value: 2 });
  });

  it("adds no other slice when everything fits", () => {
    expect(topServices(services.slice(0, 3), 4).map((i) => i.key)).toEqual(["a", "b", "e"]);
  });
});
