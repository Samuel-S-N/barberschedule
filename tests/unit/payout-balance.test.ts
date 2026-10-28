import { formatDayMonth } from "../../src/features/payouts/format";
import { payoutBadge, periodLines } from "../../src/features/payouts/balance";
import type { PayoutOverviewItem } from "../../src/features/payouts/types";

describe("payoutBadge", () => {
  it("a negative balance is overpaid regardless of status", () => expect(payoutBadge("ok", -2000)).toEqual({ key: "overpaid", tone: "warning" }));
  it("due today warns", () => expect(payoutBadge("due_today", 5000)).toEqual({ key: "dueToday", tone: "warning" }));
  it("pending is the danger state", () => expect(payoutBadge("pending", 5000)).toEqual({ key: "pending", tone: "danger" }));
  it("no schedule is neutral", () => expect(payoutBadge("no_schedule", 5000)).toEqual({ key: "noSchedule", tone: "neutral" }));
  it("settled when nothing is left", () => expect(payoutBadge("ok", 0)).toEqual({ key: "settled", tone: "success" }));
  it("ok with a balance still left", () => expect(payoutBadge("ok", 1000)).toEqual({ key: "ok", tone: "success" }));
});

describe("formatDayMonth", () => {
  it("renders dd/mm from an ISO date", () => expect(formatDayMonth("2026-10-05")).toBe("05/10"));
});

const item = (patch: Partial<PayoutOverviewItem>): PayoutOverviewItem => ({
  balanceCents: 0, barberId: "b1", barberName: "Ana", config: { day1: 5, day2: null, schedule: "weekly" }, currentOpenCents: 0, earnedCents: 0,
  lastDueDate: null, nextDueDate: "2026-11-06", paidCents: 0, periodStart: "2026-10-30", priorOpenCents: 0, status: "ok", trackingStart: "2026-10-01", ...patch,
});

describe("periodLines", () => {
  it("shows previous and current period with a total when something is left from before", () => {
    const rows = periodLines(item({ balanceCents: 12000, currentOpenCents: 4000, priorOpenCents: 8000 }), { withTotal: true });

    expect(rows).toEqual([{ cents: 12000, key: "total" }, { cents: 8000, key: "prior" }, { cents: 4000, endsOn: "2026-11-05", key: "current" }]);
  });

  it("drops the total row when asked", () => {
    const rows = periodLines(item({ balanceCents: 12000, currentOpenCents: 4000, priorOpenCents: 8000 }), { withTotal: false });

    expect(rows.map((r) => r.key)).toEqual(["prior", "current"]);
  });

  it("shows only the current period, ending the day before the next due date, when nothing is left from before", () => {
    expect(periodLines(item({ balanceCents: 4000, currentOpenCents: 4000 }), { withTotal: true })).toEqual([{ cents: 4000, endsOn: "2026-11-05", key: "current" }]);
  });

  it("has no end date when there is no next due date", () => {
    expect(periodLines(item({ balanceCents: 4000, currentOpenCents: 4000, nextDueDate: null }), { withTotal: true })).toEqual([{ cents: 4000, endsOn: null, key: "current" }]);
  });

  it("shows overpaid as a positive amount", () => {
    expect(periodLines(item({ balanceCents: -2500, currentOpenCents: -2500 }), { withTotal: true })).toEqual([{ cents: 2500, key: "overpaid" }]);
    expect(periodLines(item({ balanceCents: -2500, currentOpenCents: -2500 }), { withTotal: false })).toEqual([]);
  });

  it("without a schedule there is just the total", () => {
    const base = item({ balanceCents: 1500, config: { day1: null, day2: null, schedule: "none" }, currentOpenCents: 1500, nextDueDate: null, periodStart: null });

    expect(periodLines(base, { withTotal: true })).toEqual([{ cents: 1500, key: "total" }]);
    expect(periodLines(base, { withTotal: false })).toEqual([]);
  });
});
