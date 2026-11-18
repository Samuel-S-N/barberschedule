import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useSupabaseSession } from "../../providers/AppProviders";
import { getMyShop } from "./my-shop";

// `get_my_shop` (security definer) replaces the old "first row of `shops`", which picked the alphabetically first business for
// every owner once a second shop existed.
export async function getOwnerShopId(supabase: Pick<SupabaseClient, "rpc">): Promise<string | null> {
  return (await getMyShop(supabase))?.shopId ?? null;
}

// The owner's shop id, from the get_my_shop RPC. `null` data means the owner has no shop yet.
// Same query key as useMyShop (the ShopGate), so the RPC runs once and both read the same cache entry.
export function useOwnerShopId() {
  const { profile, supabase } = useSupabaseSession();

  return useQuery({ queryFn: () => getMyShop(supabase), queryKey: ["my-shop", profile?.userId], select: (shop) => shop?.shopId ?? null, staleTime: 5 * 60_000 });
}
