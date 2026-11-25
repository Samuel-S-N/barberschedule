import type { SupabaseClient } from "@supabase/supabase-js";

import { listShopHours } from "../shops/api";
import { createWorkingPeriod } from "./api";

// Copies the shop's opening hours into one professional's working periods (the schedule screen's button and "Serve as a professional" both
// use it). One insert per period, in order; the first failure stops and rethrows (what was written stays, the owner sees it on the schedule).
export async function copyShopHoursToProfessional(supabase: Pick<SupabaseClient, "from">, shopId: string, professionalId: string): Promise<number> {
  const periods = await listShopHours(supabase, shopId);

  for (const period of periods) {
    await createWorkingPeriod(supabase, { endTime: period.end, professionalId, shopId, startTime: period.start, weekday: period.weekday });
  }

  return periods.length;
}
