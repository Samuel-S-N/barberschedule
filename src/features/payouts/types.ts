export type PayoutSchedule = "none" | "weekly" | "biweekly" | "monthly";
export type PayoutStatus = "no_schedule" | "ok" | "due_today" | "pending";
export type PayoutScheduleConfig = { day1: number | null; day2: number | null; schedule: PayoutSchedule };

export type PayoutOverviewItem = {
  balanceCents: number;
  barberId: string;
  barberName: string;
  config: PayoutScheduleConfig;
  currentOpenCents: number;
  earnedCents: number;
  lastDueDate: string | null;
  nextDueDate: string | null;
  paidCents: number;
  periodStart: string | null;
  priorOpenCents: number;
  status: PayoutStatus;
  trackingStart: string;
};

export type PayoutListItem = { amountCents: number; barberId: string; barberName: string; id: string; note: string | null; paidOn: string };

export type MyPayoutSummary = {
  balanceCents: number;
  config: PayoutScheduleConfig;
  nextDueDate: string | null;
  pastUnmarkedCount: number;
  payouts: { amountCents: number; id: string; note: string | null; paidOn: string }[];
  trackingStart: string;
};

export type OverviewRow = {
  balance_cents: number; barber_id: string; barber_name: string; current_open_cents: number; earned_cents: number; last_due_date: string | null; next_due_date: string | null;
  paid_cents: number; payout_day_1: number | null; payout_day_2: number | null; payout_schedule: PayoutSchedule; period_start: string | null; prior_open_cents: number; status: PayoutStatus; tracking_start: string;
};

export type PayoutRow = { amount_cents: number; barber_id: string; barber_name?: string; id: string; note: string | null; paid_on: string };

export type SummaryRow = {
  balance_cents: number; day_1: number | null; day_2: number | null; next_due_date: string | null; past_unmarked_count: number;
  payouts: { amount_cents: number; id: string; note: string | null; paid_on: string }[]; schedule: PayoutSchedule; tracking_start: string;
};
