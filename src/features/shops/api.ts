import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import { addressToColumns } from "./address";
import type { ShopAddress, ShopAddressColumns } from "./address";
import type { ShopPeriod } from "./hours";

export type PublicShop = ShopAddressColumns & { id: string; name: string; phone: string | null; slug: string; whatsapp: string | null };

const PUBLIC_SHOP_COLUMNS =
  "id, name, slug, phone, whatsapp, address_cep, address_street, address_number, address_complement, address_district, address_city, address_state, address_city_ibge";

export async function listPublicShops(supabase: Pick<SupabaseClient, "from">) {
  const { data, error } = await supabase.from("shops").select(PUBLIC_SHOP_COLUMNS).order("name");

  if (error) {
    throw error;
  }

  return (data ?? []) as PublicShop[];
}

// `.limit(1)` and an array (not `.maybeSingle()`): one shop per slug, and the e2e mocks answer with plain arrays.
export async function getShopBySlug(supabase: Pick<SupabaseClient, "from">, slug: string): Promise<PublicShop | null> {
  const { data, error } = await supabase.from("shops").select(PUBLIC_SHOP_COLUMNS).eq("slug", slug).limit(1);

  if (error) throw error;

  return ((data ?? []) as PublicShop[])[0] ?? null;
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
  input: { address: ShopAddress; phone: string; whatsapp: string },
) {
  const clean = (value: string) => value.trim() || null;
  const { error } = await supabase
    .from("shops")
    .update({ ...addressToColumns(input.address), phone: clean(input.phone), whatsapp: clean(input.whatsapp) })
    .eq("id", shopId);
  if (error) throw toDomainError(error);
}
