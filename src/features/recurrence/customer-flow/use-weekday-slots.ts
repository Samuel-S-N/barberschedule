import { useQueries } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { getAvailableSlotsQueryOptions } from "../../availability/query";
import { nextDateForWeekday } from "../weekday";

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// The next date of each weekday (a series' first date is never today) and that date's free times; weekdays
// without any free time are `disabledDays`. Shared by the customer's plan flow and the staff's manual recurrence.
export function useWeekdaySlots({ barberId, barberServiceId, enabled, today }: { barberId: string; barberServiceId: string; enabled: boolean; today: string }) {
  const { supabase } = useSupabaseSession();
  const dates = Object.fromEntries(WEEKDAYS.map((day) => [day, nextDateForWeekday(today, day)])) as Record<number, string>;
  const queries = useQueries({
    queries: WEEKDAYS.map((day) => ({
      ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate: dates[day] }),
      enabled,
    })),
  });
  const disabledDays = WEEKDAYS.filter((day) => queries[day - 1].isSuccess && (queries[day - 1].data ?? []).length === 0);

  return { dates, disabledDays, queries };
}
