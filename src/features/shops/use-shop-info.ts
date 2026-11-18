import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listShopHours } from "./api";
import { useCurrentShop } from "./CurrentShopProvider";

// The business of the current subdomain and its opening hours.
export function useShopInfo() {
  const { supabase } = useSupabaseSession();
  const { shop } = useCurrentShop();
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });

  return { hours: hours.data ?? [], shop: shop ?? undefined };
}
