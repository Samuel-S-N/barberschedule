import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { resolveEffectiveServiceFields } from "./resolve-effective-fields";

type Row = {
  duration_override_minutes: number | null;
  id: string;
  price_override_cents: number | null;
  services: { duration_minutes: number; name: string; price_cents: number } | null;
};

export type ProfessionalServiceOption = {
  professionalServiceId: string;
  durationMinutes: number;
  name: string | null;
  priceCents: number;
};

export function useProfessionalServices(professionalId: string) {
  const { supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(professionalId),
    queryFn: async (): Promise<ProfessionalServiceOption[]> => {
      const { data, error } = await supabase
        .from("professional_services")
        .select("id, duration_override_minutes, price_override_cents, services(name, duration_minutes, price_cents)")
        .eq("professional_id", professionalId)
        .order("id");
      if (error) throw error;

      return ((data ?? []) as unknown as Row[]).map((row) => ({
        ...resolveEffectiveServiceFields({
          durationMinutes: row.services?.duration_minutes ?? 0,
          durationOverrideMinutes: row.duration_override_minutes,
          priceCents: row.services?.price_cents ?? 0,
          priceOverrideCents: row.price_override_cents,
        }),
        professionalServiceId: row.id,
        name: row.services?.name ?? null,
      }));
    },
    queryKey: ["public-professional-services", professionalId],
  });
}
