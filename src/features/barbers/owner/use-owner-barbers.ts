import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { useOwnerShopId } from "../../shops/use-owner-shop-id";
import { getBarberAccountStatus, listOwnerBarbers } from "../api";
import type { OwnerBarber } from "../types";

// The owner's barbers with whether each linked barber has signed in; shared by the list and the profile screens.
export function useOwnerBarbers() {
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const barbers = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const list: OwnerBarber[] = await listOwnerBarbers(supabase, shopId ?? "");
      const linked = list.filter((barber: OwnerBarber) => barber.userId);
      const entries = await Promise.all(linked.map(async (barber: OwnerBarber) => [barber.id, await getBarberAccountStatus(supabase, barber.id).catch(() => false)] as const));

      return { list, signedIn: Object.fromEntries(entries) as Record<string, boolean> };
    },
    queryKey: ["owner-barbers", shopId],
  });

  return { barbers, shop, shopId };
}
