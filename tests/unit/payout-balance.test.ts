import { formatDayMonth } from "../../src/features/payouts/format";
import { payoutBadge } from "../../src/features/payouts/balance";

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
