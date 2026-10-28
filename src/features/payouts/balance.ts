import type { PayoutStatus } from "./types";

export type PayoutBadge = { key: "dueToday" | "noSchedule" | "ok" | "overpaid" | "pending" | "settled"; tone: "danger" | "neutral" | "success" | "warning" };

export function payoutBadge(status: PayoutStatus, balanceCents: number): PayoutBadge {
  if (balanceCents < 0) return { key: "overpaid", tone: "warning" };
  if (status === "due_today") return { key: "dueToday", tone: "warning" };
  if (status === "pending") return { key: "pending", tone: "danger" };
  if (status === "no_schedule") return { key: "noSchedule", tone: "neutral" };

  return balanceCents === 0 ? { key: "settled", tone: "success" } : { key: "ok", tone: "success" };
}
