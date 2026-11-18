import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useSupabaseSession } from "../../providers/AppProviders";

export type MyShop = { shopId: string; slug: string };

// The caller's own shop as staff (owner, or the shop a professional works in). `shops.owner_user_id` is not readable by
// clients, so this goes through the security definer RPC get_my_shop (migration 0068).
export async function getMyShop(supabase: Pick<SupabaseClient, "rpc">): Promise<MyShop | null> {
  const { data, error } = await supabase.rpc("get_my_shop");

  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { shop_id: string; slug: string } | null | undefined;

  return row ? { shopId: row.shop_id, slug: row.slug } : null;
}

// No retries: the gate treats a failed lookup as "no staff shop" and lets the app through, instead of holding it behind a spinner.
export function useMyShop() {
  const { profile, supabase } = useSupabaseSession();
  const staff = profile?.role === "owner" || profile?.role === "professional";

  return useQuery({ enabled: staff, queryFn: () => getMyShop(supabase), queryKey: ["my-shop", profile?.userId], retry: false, staleTime: 5 * 60_000 });
}
