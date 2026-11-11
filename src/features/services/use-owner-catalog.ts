import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listOwnerProfessionals } from "../professionals/api";
import type { OwnerProfessional } from "../professionals/types";
import { useOwnerShopId } from "../shops/use-owner-shop-id";
import { listOwnerProfessionalServices, listOwnerServices } from "./api";

// Services, active professionals and their service assignments for the owner's shop; shared by the list and the form screens.
export function useOwnerServiceCatalog() {
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const catalog = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [services, professionals, professionalServices] = await Promise.all([listOwnerServices(supabase, id), listOwnerProfessionals(supabase, id), listOwnerProfessionalServices(supabase, id)]);

      return { professionalServices, professionals: professionals.filter((professional: OwnerProfessional) => professional.active) as OwnerProfessional[], services };
    },
    queryKey: ["owner-services", shopId],
  });

  return { catalog, shop, shopId };
}
