import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listOwnerBarbers } from "../barbers/api";
import type { OwnerBarber } from "../barbers/types";
import { useOwnerShopId } from "../shops/use-owner-shop-id";
import { listOwnerBarberServices, listOwnerServices } from "./api";

// Services, active barbers and their service assignments for the owner's shop; shared by the list and the form screens.
export function useOwnerServiceCatalog() {
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const catalog = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [services, barbers, barberServices] = await Promise.all([listOwnerServices(supabase, id), listOwnerBarbers(supabase, id), listOwnerBarberServices(supabase, id)]);

      return { barberServices, barbers: barbers.filter((barber: OwnerBarber) => barber.active) as OwnerBarber[], services };
    },
    queryKey: ["owner-services", shopId],
  });

  return { catalog, shop, shopId };
}
