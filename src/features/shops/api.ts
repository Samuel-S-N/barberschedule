import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import type { ShopPeriod } from "./hours";

export type PublicShop = {
  address: string | null;
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
};

export async function listPublicShops(supabase: Pick<SupabaseClient, "from">) {
  const { data, error } = await supabase.from("shops").select("id, name, address, phone, whatsapp").order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as PublicShop[];
}

export async function listShopHours(supabase: Pick<SupabaseClient, "from">, shopId: string): Promise<ShopPeriod[]> {
  const { data, error } = await supabase
    .from("shop_hours")
    .select("weekday, start_time, end_time")
    .eq("shop_id", shopId)
    .order("weekday")
    .order("start_time");
  if (error) throw toDomainError(error);

  return (data ?? []).map((row) => ({
    end: String(row.end_time).slice(0, 5),
    start: String(row.start_time).slice(0, 5),
    weekday: Number(row.weekday),
  }));
}

export async function saveShopHours(supabase: Pick<SupabaseClient, "rpc">, periods: ShopPeriod[]) {
  const { error } = await supabase.rpc("set_shop_hours", { p_periods: periods });
  if (error) throw toDomainError(error);
}

export async function updateShopContact(
  supabase: Pick<SupabaseClient, "from">,
  shopId: string,
  input: { address: string; phone: string; whatsapp: string },
) {
  const clean = (value: string) => value.trim() || null;
  const { error } = await supabase
    .from("shops")
    .update({ address: clean(input.address), phone: clean(input.phone), whatsapp: clean(input.whatsapp) })
    .eq("id", shopId);
  if (error) throw toDomainError(error);
}
