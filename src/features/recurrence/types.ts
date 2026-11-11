export type RecurrenceSeriesRow = {
  active: boolean;
  professional_service_id: string;
  customer_id: string;
  customer_name?: string;
  ended_at: string | null;
  id: string;
  interval_weeks: number;
  local_start_date: string;
  local_start_time: string;
  special_price_cents: number | null;
};

export type RecurrenceSeries = {
  active: boolean;
  professionalServiceId: string;
  customerId: string;
  customerName: string;
  endedAt: string | null;
  id: string;
  intervalWeeks: number;
  localStartDate: string;
  localStartTime: string;
  specialPriceCents: number | null;
};

export type RecurrenceConflict = {
  professionalId: string;
  professionalServiceId: string;
  customerName: string;
  customerPhone: string | null;
  id: string;
  localStartTime: string;
  occurrenceDate: string;
  reason: string;
  seriesId: string;
  serviceName: string;
  status: "open" | "resolved";
};

export type RecurrenceSeriesInput = {
  professionalServiceId: string;
  customerId: string;
  intervalWeeks: number;
  localStartDate: string;
  localStartTime: string;
  specialPriceCents?: number | null;
};
