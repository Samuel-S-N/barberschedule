import { useQueries } from "@tanstack/react-query";

import { addMonths } from "../../lib/dates/month-calendar";
import { useSupabaseSession } from "../../providers/AppProviders";
import { listUnavailableDates } from "./unavailable-api";

export const monthWindow = (visibleMonth: string) => [addMonths(visibleMonth, -1), visibleMonth, addMonths(visibleMonth, 1)];

const lastDay = (month: string) => {
  const [year, number] = month.split("-").map(Number);

  return `${month}-${String(new Date(Date.UTC(year, number, 0)).getUTCDate()).padStart(2, "0")}`;
};

// The days the professional cannot work in the visible month and its neighbours (one cached request per month, so swiping to a
// neighbour finds it ready). Nothing is dimmed without a professional, while loading, or if a request fails.
export function useUnavailableDates(professionalId: string, visibleMonth: string): readonly string[] {
  const { supabase } = useSupabaseSession();
  const results = useQueries({
    queries: monthWindow(visibleMonth).map((month) => ({
      enabled: Boolean(professionalId),
      queryFn: () => listUnavailableDates(supabase, { from: `${month}-01`, professionalId, to: lastDay(month) }),
      queryKey: ["unavailable-dates", professionalId, month],
      retry: false,
      staleTime: 5 * 60_000,
    })),
  });

  return results.flatMap((result) => result.data ?? []).sort();
}
