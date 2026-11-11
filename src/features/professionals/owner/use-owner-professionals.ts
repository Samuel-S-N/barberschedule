import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { useOwnerShopId } from "../../shops/use-owner-shop-id";
import { getProfessionalAccountStatus, listOwnerProfessionals } from "../api";
import type { OwnerProfessional } from "../types";

// The owner's professionals with whether each linked professional has signed in; shared by the list and the profile screens.
export function useOwnerProfessionals() {
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const professionals = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const list: OwnerProfessional[] = await listOwnerProfessionals(supabase, shopId ?? "");
      const linked = list.filter((professional: OwnerProfessional) => professional.userId);
      const entries = await Promise.all(linked.map(async (professional: OwnerProfessional) => [professional.id, await getProfessionalAccountStatus(supabase, professional.id).catch(() => false)] as const));

      return { list, signedIn: Object.fromEntries(entries) as Record<string, boolean> };
    },
    queryKey: ["owner-professionals", shopId],
  });

  return { professionals, shop, shopId };
}
