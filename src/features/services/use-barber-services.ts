import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { resolveEffectiveServiceFields } from "./resolve-effective-fields";

type Row = {
  duration_override_minutes: number | null;
  id: string;
  price_override_cents: number | null;
  services: { duration_minutes: number; name: string; price_cents: number } | null;
};

export type BarberServiceOption = {
  barberServiceId: string;
  durationMinutes: number;
  name: string | null;
  priceCents: number;
};

export function useBarberServices(barberId: string) {
  const { supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(barberId),
    queryFn: async (): Promise<BarberServiceOption[]> => {
      const { data, error } = await supabase
        .from("barber_services")
        .select("id, duration_override_minutes, price_override_cents, services(name, duration_minutes, price_cents)")
        .eq("barber_id", barberId)
        .order("id");
      if (error) throw error;

      return ((data ?? []) as unknown as Row[]).map((row) => ({
        ...resolveEffectiveServiceFields({
          durationMinutes: row.services?.duration_minutes ?? 0,
          durationOverrideMinutes: row.duration_override_minutes,
          priceCents: row.services?.price_cents ?? 0,
          priceOverrideCents: row.price_override_cents,
        }),
        barberServiceId: row.id,
        name: row.services?.name ?? null,
      }));
    },
    queryKey: ["public-barber-services", barberId],
  });
}
