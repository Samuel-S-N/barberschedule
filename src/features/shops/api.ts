import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicShop = { id: string; name: string };

export async function listPublicShops(supabase: Pick<SupabaseClient, "from">) {
  const { data, error } = await supabase.from("shops").select("id, name").order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as PublicShop[];
}
