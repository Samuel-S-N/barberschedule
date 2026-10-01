import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listPublicShops, listShopHours } from "./api";

// Single-shop MVP, like useAppointmentCards.
export function useShopInfo() {
  const { supabase } = useSupabaseSession();
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shop = shops.data?.[0];
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });

  return { hours: hours.data ?? [], shop };
}
