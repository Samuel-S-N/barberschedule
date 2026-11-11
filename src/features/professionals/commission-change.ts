import type { ProfessionalCompensation } from "./types";

// The owner is asked "from now on, or retroactively?" only when an existing commission percent actually changes.
export function needsCommissionChoice(current: ProfessionalCompensation, next: ProfessionalCompensation): boolean {
  return current.type === "commission" && next.type === "commission" && current.commissionPercent !== next.commissionPercent;
}
