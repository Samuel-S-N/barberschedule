import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ScheduleOverride,
  ScheduleOverrideInput,
  ScheduleOverrideRow,
  WorkingPeriod,
  WorkingPeriodInput,
  WorkingPeriodRow,
} from "./types";
import {
  parseScheduleOverrideInput,
  parseWorkingPeriodInput,
} from "./validation";

type ScheduleSupabaseClient = Pick<SupabaseClient, "from">;

type ScheduleDatabaseError = {
  code?: string;
};

export type ScheduleErrorCode =
  | "SCHEDULE_DUPLICATE_PERIOD"
  | "SCHEDULE_FORBIDDEN"
  | "SCHEDULE_INVALID_INTERVAL"
  | "SCHEDULE_OVERLAPPING_PERIOD"
  | "SCHEDULE_REQUEST_FAILED";

export class ScheduleError extends Error {
  constructor(
    public readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

const workingPeriodColumns = "id, shop_id, barber_id, weekday, start_time, end_time";
const scheduleOverrideColumns = "id, shop_id, barber_id, local_date, kind, start_time, end_time";

export function toScheduleError(error: ScheduleDatabaseError): ScheduleError {
  switch (error.code) {
    case "23505":
      return new ScheduleError(
        "SCHEDULE_DUPLICATE_PERIOD",
        "This working period already exists.",
      );
    case "23P01":
      return new ScheduleError(
        "SCHEDULE_OVERLAPPING_PERIOD",
        "Working periods cannot overlap.",
      );
    case "23514":
      return new ScheduleError(
        "SCHEDULE_INVALID_INTERVAL",
        "Start time must be before end time.",
      );
    case "42501":
      return new ScheduleError(
        "SCHEDULE_FORBIDDEN",
        "You do not have permission to manage this schedule.",
      );
    default:
      return new ScheduleError(
        "SCHEDULE_REQUEST_FAILED",
        "Unable to update the schedule.",
      );
  }
}

function throwIfError(error: ScheduleDatabaseError | null) {
  if (error) {
    throw toScheduleError(error);
  }
}

function toTime(value: string) {
  return value.slice(0, 5);
}

function toWorkingPeriod(row: WorkingPeriodRow): WorkingPeriod {
  return {
    barberId: row.barber_id,
    endTime: toTime(row.end_time),
    id: row.id,
    shopId: row.shop_id,
    startTime: toTime(row.start_time),
    weekday: row.weekday,
  };
}

function toScheduleOverride(row: ScheduleOverrideRow): ScheduleOverride {
  return {
    barberId: row.barber_id,
    endTime: row.end_time ? toTime(row.end_time) : null,
    id: row.id,
    kind: row.kind,
    localDate: row.local_date,
    shopId: row.shop_id,
    startTime: row.start_time ? toTime(row.start_time) : null,
  };
}

export async function listOwnerWorkingPeriods(
  supabase: ScheduleSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("working_periods")
    .select(workingPeriodColumns)
    .eq("shop_id", shopId)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toWorkingPeriod(row as WorkingPeriodRow));
}

export async function createWorkingPeriod(
  supabase: ScheduleSupabaseClient,
  input: WorkingPeriodInput,
) {
  const parsed = parseWorkingPeriodInput(input);
  const { data, error } = await supabase
    .from("working_periods")
    .insert({
      barber_id: parsed.barberId,
      end_time: parsed.endTime,
      shop_id: parsed.shopId,
      start_time: parsed.startTime,
      weekday: parsed.weekday,
    })
    .select(workingPeriodColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Working period insert returned no row.");
  }

  return toWorkingPeriod(data as WorkingPeriodRow);
}

export async function deleteWorkingPeriod(
  supabase: ScheduleSupabaseClient,
  workingPeriodId: string,
) {
  const { error } = await supabase.from("working_periods").delete().eq("id", workingPeriodId);
  throwIfError(error);
}

export async function listOwnerScheduleOverrides(
  supabase: ScheduleSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("schedule_overrides")
    .select(scheduleOverrideColumns)
    .eq("shop_id", shopId)
    .order("local_date", { ascending: true })
    .order("start_time", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toScheduleOverride(row as ScheduleOverrideRow));
}

export async function createScheduleOverride(
  supabase: ScheduleSupabaseClient,
  input: ScheduleOverrideInput,
) {
  const parsed = parseScheduleOverrideInput(input);
  const { data, error } = await supabase
    .from("schedule_overrides")
    .insert({
      barber_id: parsed.barberId,
      end_time: parsed.endTime,
      kind: parsed.kind,
      local_date: parsed.localDate,
      shop_id: parsed.shopId,
      start_time: parsed.startTime,
    })
    .select(scheduleOverrideColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Schedule override insert returned no row.");
  }

  return toScheduleOverride(data as ScheduleOverrideRow);
}

export async function deleteScheduleOverride(
  supabase: ScheduleSupabaseClient,
  scheduleOverrideId: string,
) {
  const { error } = await supabase.from("schedule_overrides").delete().eq("id", scheduleOverrideId);
  throwIfError(error);
}
