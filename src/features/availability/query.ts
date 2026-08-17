import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAvailableSlots } from "./api";
import type { AvailableSlotsInput } from "./types";

export function getAvailableSlotsQueryOptions(
  supabase: Pick<SupabaseClient, "rpc">,
  input: AvailableSlotsInput,
) {
  return queryOptions({
    queryFn: () => getAvailableSlots(supabase, input),
    queryKey: [
      "available-slots",
      input.barberId,
      input.localDate,
      input.barberServiceId,
    ],
  });
}
