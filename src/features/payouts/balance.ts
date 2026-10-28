import { addLocalDays } from "../../lib/dates/calendar-strip-days";
import type { PayoutOverviewItem, PayoutStatus } from "./types";

export type PayoutBadge = { key: "dueToday" | "noSchedule" | "ok" | "overpaid" | "pending" | "settled"; tone: "danger" | "neutral" | "success" | "warning" };

export function payoutBadge(status: PayoutStatus, balanceCents: number): PayoutBadge {
  if (balanceCents < 0) return { key: "overpaid", tone: "warning" };
  if (status === "due_today") return { key: "dueToday", tone: "warning" };
  if (status === "pending") return { key: "pending", tone: "danger" };
  if (status === "no_schedule") return { key: "noSchedule", tone: "neutral" };

  return balanceCents === 0 ? { key: "settled", tone: "success" } : { key: "ok", tone: "success" };
}

export type PeriodRow = { cents: number; endsOn?: string | null; key: "current" | "overpaid" | "prior" | "total" };

// The rows to show for a barber's balance. The current period ends the day before the next due date; the due date opens a new one.
export function periodLines(
  item: Pick<PayoutOverviewItem, "balanceCents" | "config" | "currentOpenCents" | "nextDueDate" | "priorOpenCents">,
  { withTotal }: { withTotal: boolean },
): PeriodRow[] {
  const total: PeriodRow = item.balanceCents < 0 ? { cents: -item.balanceCents, key: "overpaid" } : { cents: item.balanceCents, key: "total" };
  const endsOn = item.nextDueDate ? addLocalDays(item.nextDueDate, -1) : null;

  if (item.config.schedule === "none") return withTotal ? [total] : [];
  if (item.priorOpenCents > 0) return [...(withTotal ? [total] : []), { cents: item.priorOpenCents, key: "prior" }, { cents: item.currentOpenCents, endsOn, key: "current" }];
  if (item.balanceCents < 0) return withTotal ? [total] : [];

  return [{ cents: item.currentOpenCents, endsOn, key: "current" }];
}
