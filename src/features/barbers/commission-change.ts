import type { BarberCompensation } from "./types";

// The owner is asked "from now on, or retroactively?" only when an existing commission percent actually changes.
export function needsCommissionChoice(current: BarberCompensation, next: BarberCompensation): boolean {
  return current.type === "commission" && next.type === "commission" && current.commissionPercent !== next.commissionPercent;
}
