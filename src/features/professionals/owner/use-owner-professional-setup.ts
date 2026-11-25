import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { listOwnerWorkingPeriods } from "../../schedule/api";
import { listOwnerProfessionalServices } from "../../services/api";
import { useOwnerShopId } from "../../shops/use-owner-shop-id";

// Whether the owner's own professional can be booked: it needs working hours and at least one active service. The query keys start with
// the prefixes the schedule screen and the services editor already invalidate, so the hub's guide follows their changes.
export function useOwnerProfessionalSetup(professionalId: string | null) {
  const { supabase } = useSupabaseSession();
  const shopId = useOwnerShopId().data ?? null;
  const enabled = professionalId !== null && shopId !== null;
  const hours = useQuery({
    enabled,
    queryFn: async () => (await listOwnerWorkingPeriods(supabase, shopId ?? "")).some((period) => period.professionalId === professionalId),
    queryKey: ["owner-schedule", "setup", shopId, professionalId],
  });
  const services = useQuery({
    enabled,
    queryFn: async () => (await listOwnerProfessionalServices(supabase, shopId ?? "")).some((item) => item.professionalId === professionalId && item.active),
    queryKey: ["owner-professional-services", "setup", shopId, professionalId],
  });
  const isLoading = !enabled || hours.isLoading || services.isLoading;

  // While loading (or on a failed read) nothing is reported missing, so the guide never flashes or nags about something it does not know.
  return { hasHours: isLoading || hours.isError ? true : hours.data === true, hasServices: isLoading || services.isError ? true : services.data === true, isLoading };
}
