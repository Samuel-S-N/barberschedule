import { draftToPeriods, formatPeriods, groupWeek, periodsToDraft } from "../../src/features/shops/hours";

const day = { breaks: [], enabled: true, end: "18:00", start: "09:00" };

describe("draftToPeriods", () => {
  it("returns no periods for a closed day", () => {
    expect(draftToPeriods({ ...day, enabled: false })).toEqual({ ok: true, periods: [] });
  });

  it("returns one period without breaks", () => {
    expect(draftToPeriods(day)).toEqual({ ok: true, periods: [{ end: "18:00", start: "09:00" }] });
  });

  it("splits the day around lunch and other breaks, in order", () => {
    const result = draftToPeriods({ ...day, breaks: [{ end: "16:30", start: "16:00" }, { end: "13:00", start: "12:00" }] });

    expect(result).toEqual({
      ok: true,
      periods: [
        { end: "12:00", start: "09:00" },
        { end: "16:00", start: "13:00" },
        { end: "18:00", start: "16:30" },
      ],
    });
  });

  it.each([
    ["bad time", { ...day, start: "9h" }, "time"],
    ["end before start", { ...day, end: "08:00" }, "range"],
    ["break outside the day", { ...day, breaks: [{ end: "19:00", start: "17:00" }] }, "break"],
    ["break touching the opening", { ...day, breaks: [{ end: "10:00", start: "09:00" }] }, "break"],
    ["break with end before start", { ...day, breaks: [{ end: "12:00", start: "13:00" }] }, "break"],
    ["overlapping breaks", { ...day, breaks: [{ end: "13:00", start: "12:00" }, { end: "14:00", start: "12:30" }] }, "break"],
  ])("rejects %s", (_name, draft, error) => {
    expect(draftToPeriods(draft)).toEqual({ error, ok: false });
  });
});

describe("periodsToDraft", () => {
  it("round-trips breaks as gaps", () => {
    const draft = periodsToDraft([{ end: "12:00", start: "09:00" }, { end: "18:00", start: "13:00" }]);

    expect(draft).toEqual({ breaks: [{ end: "13:00", start: "12:00" }], enabled: true, end: "18:00", start: "09:00" });
  });

  it("defaults a day without periods to closed", () => {
    expect(periodsToDraft([])).toEqual({ breaks: [], enabled: false, end: "18:00", start: "09:00" });
  });
});

describe("groupWeek / formatPeriods", () => {
  const rows = [1, 2, 3, 4, 5]
    .flatMap((weekday) => [
      { end: "12:00", start: "09:00", weekday },
      { end: "18:00", start: "13:00", weekday },
    ])
    .concat([{ end: "13:00", start: "09:00", weekday: 6 }]);

  it("merges consecutive identical days and skips closed ones", () => {
    expect(groupWeek(rows)).toEqual([
      { from: 1, periods: [{ end: "12:00", start: "09:00" }, { end: "18:00", start: "13:00" }], to: 5 },
      { from: 6, periods: [{ end: "13:00", start: "09:00" }], to: 6 },
    ]);
  });

  it("formats periods with a separator", () => {
    expect(formatPeriods([{ end: "12:00", start: "09:00" }, { end: "18:00", start: "13:00" }])).toBe("09:00–12:00 · 13:00–18:00");
  });
});
