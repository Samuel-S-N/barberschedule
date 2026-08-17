import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AvailableSlot,
  AvailableSlotRow,
  AvailableSlotsInput,
} from "./types";

type AvailabilitySupabaseClient = Pick<SupabaseClient, "rpc">;

type AvailabilityDatabaseError = {
  code?: string;
};

export type AvailabilityErrorCode =
  | "AVAILABILITY_FORBIDDEN"
  | "AVAILABILITY_INVALID_DATE"
  | "AVAILABILITY_REQUEST_FAILED";

export class AvailabilityError extends Error {
  constructor(
    public readonly code: AvailabilityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AvailabilityError";
  }
}

export function toAvailabilityError(error: AvailabilityDatabaseError): AvailabilityError {
  switch (error.code) {
    case "22007":
      return new AvailabilityError("AVAILABILITY_INVALID_DATE", "Choose a valid date.");
    case "42501":
      return new AvailabilityError(
        "AVAILABILITY_FORBIDDEN",
        "You do not have permission to view availability.",
      );
    default:
      return new AvailabilityError(
        "AVAILABILITY_REQUEST_FAILED",
        "Unable to load availability.",
      );
  }
}

function toTime(value: string) {
  return value.slice(0, 5);
}

function toAvailableSlot(row: AvailableSlotRow): AvailableSlot {
  return {
    endsAt: row.ends_at,
    localDate: row.local_date,
    localTime: toTime(row.local_time),
    startsAt: row.starts_at,
  };
}

export async function getAvailableSlots(
  supabase: AvailabilitySupabaseClient,
  input: AvailableSlotsInput,
) {
  const { data, error } = await supabase.rpc("get_available_slots", {
    barber_id: input.barberId,
    barber_service_id: input.barberServiceId,
    local_date: input.localDate,
  });

  if (error) {
    throw toAvailabilityError(error);
  }

  return (data ?? []).map((row: unknown) => toAvailableSlot(row as AvailableSlotRow));
}
