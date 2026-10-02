import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import { useSupabaseSession } from "../../providers/AppProviders";

export async function getOwnerShopId(supabase: Pick<SupabaseClient, "from">): Promise<string | null> {
  const { data, error } = await supabase.from("shops").select("id").order("name", { ascending: true });

  if (error) throw error;

  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

// The owner's shop id (RLS limits `shops` to their own). `null` data means the owner has no shop yet.
export function useOwnerShopId() {
  const { profile, supabase } = useSupabaseSession();

  return useQuery({ queryFn: () => getOwnerShopId(supabase), queryKey: ["owner-shop-id", profile?.userId] });
}
