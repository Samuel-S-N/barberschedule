export type ScheduleOverrideKind = "block" | "opening";

export type WorkingPeriod = {
  professionalId: string;
  endTime: string;
  id: string;
  shopId: string;
  startTime: string;
  weekday: number;
};

export type WorkingPeriodInput = Omit<WorkingPeriod, "id">;

export type WorkingPeriodRow = {
  professional_id: string;
  end_time: string;
  id: string;
  shop_id: string;
  start_time: string;
  weekday: number;
};

export type ScheduleOverride = {
  professionalId: string;
  endTime: string | null;
  id: string;
  kind: ScheduleOverrideKind;
  localDate: string;
  shopId: string;
  startTime: string | null;
};

export type ScheduleOverrideInput = Omit<ScheduleOverride, "endTime" | "id" | "startTime"> & {
  endTime?: string | null;
  startTime?: string | null;
};

export type ScheduleOverrideRow = {
  professional_id: string;
  end_time: string | null;
  id: string;
  kind: ScheduleOverrideKind;
  local_date: string;
  shop_id: string;
  start_time: string | null;
};
