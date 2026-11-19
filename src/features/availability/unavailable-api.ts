import type { SupabaseClient } from "@supabase/supabase-js";

import { toAvailabilityError } from "./api";

type UnavailableSupabaseClient = Pick<SupabaseClient, "rpc">;

// The dates in [from, to] on which the professional has no working time left (weekly day off, a block, a shop closure). Dates only.
export async function listUnavailableDates(
  supabase: UnavailableSupabaseClient,
  input: { from: string; professionalId: string; to: string },
): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_unavailable_dates", {
    from_date: input.from,
    professional_id: input.professionalId,
    to_date: input.to,
  });

  if (error) throw toAvailabilityError(error);

  return ((data ?? []) as unknown[]).map(String);
}
