import { z } from "zod";

import type {
  ScheduleOverrideInput,
  WorkingPeriod,
  WorkingPeriodInput,
} from "./types";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function isIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

const timeSchema = z.string().regex(timePattern, "Time must use HH:mm.");

const workingPeriodSchema = z.object({
  barberId: z.string().uuid("Barber id must be a UUID."),
  endTime: timeSchema,
  shopId: z.string().uuid("Shop id must be a UUID."),
  startTime: timeSchema,
  weekday: z.number().int().min(1).max(7),
}).refine(
  ({ endTime, startTime }) => timeToMinutes(endTime) > timeToMinutes(startTime),
  { message: "End time must be after start time.", path: ["endTime"] },
);

const scheduleOverrideSchema = z.object({
  barberId: z.string().uuid("Barber id must be a UUID."),
  endTime: timeSchema.nullish(),
  kind: z.enum(["block", "opening"]),
  localDate: z.string().refine(isIsoDate, "Local date must use YYYY-MM-DD."),
  shopId: z.string().uuid("Shop id must be a UUID."),
  startTime: timeSchema.nullish(),
}).superRefine(({ endTime, kind, startTime }, context) => {
  const hasStartTime = startTime !== null && startTime !== undefined;
  const hasEndTime = endTime !== null && endTime !== undefined;

  if (kind === "opening" && (!hasStartTime || !hasEndTime)) {
    context.addIssue({
      code: "custom",
      message: "Extra openings require a start and end time.",
      path: ["startTime"],
    });
    return;
  }

  if (kind === "block" && hasStartTime !== hasEndTime) {
    context.addIssue({
      code: "custom",
      message: "Partial blocks require both start and end times.",
      path: ["startTime"],
    });
    return;
  }

  if (hasStartTime && hasEndTime && timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    context.addIssue({
      code: "custom",
      message: "End time must be after start time.",
      path: ["endTime"],
    });
  }
});

export function parseWorkingPeriodInput(input: WorkingPeriodInput) {
  return workingPeriodSchema.parse(input);
}

export function assertNoOverlappingWorkingPeriod(
  candidate: WorkingPeriodInput,
  periods: Pick<WorkingPeriod, "barberId" | "endTime" | "startTime" | "weekday">[],
) {
  const overlaps = periods.some(
    (period) =>
      period.barberId === candidate.barberId
      && period.weekday === candidate.weekday
      && candidate.startTime < period.endTime
      && candidate.endTime > period.startTime,
  );

  if (overlaps) {
    // Same stable code the database error maps to, so the UI can translate either one.
    throw Object.assign(new Error("Working periods cannot overlap."), { code: "SCHEDULE_OVERLAPPING_PERIOD" });
  }
}

export function parseScheduleOverrideInput(input: ScheduleOverrideInput) {
  const parsed = scheduleOverrideSchema.parse(input);

  return {
    ...parsed,
    endTime: parsed.endTime ?? null,
    startTime: parsed.startTime ?? null,
  };
}
