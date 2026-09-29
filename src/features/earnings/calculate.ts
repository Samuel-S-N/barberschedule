import type { BarberCompensation } from "../barbers/types";

export type EarningsRow = {
  completedCount: number;
  grossCents: number;
  serviceId: string;
  serviceName: string;
};

export type BarberEarnings = {
  completedCount: number;
  earningsCents: number;
  grossCents: number;
  rentalDue: { amountCents: number; frequency: "weekly" | "monthly" } | null;
};

// Commission: barber keeps `percent` of gross. Chair rental: barber keeps all gross;
// the configured rent is shown separately, never netted against an arbitrary date range.
export function calculateBarberEarnings(rows: EarningsRow[], compensation: BarberCompensation): BarberEarnings {
  const grossCents = rows.reduce((sum, row) => sum + row.grossCents, 0);
  const completedCount = rows.reduce((sum, row) => sum + row.completedCount, 0);

  if (compensation.type === "chair_rental") {
    return {
      completedCount,
      earningsCents: grossCents,
      grossCents,
      rentalDue: { amountCents: compensation.amountCents, frequency: compensation.frequency },
    };
  }

  return {
    completedCount,
    earningsCents: Math.round((grossCents * compensation.commissionPercent) / 100),
    grossCents,
    rentalDue: null,
  };
}
