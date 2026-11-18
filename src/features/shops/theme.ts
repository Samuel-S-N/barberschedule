import type { SupabaseClient } from "@supabase/supabase-js";

import type { ThemeInput } from "../../lib/design/theme/derive";
import { toDomainError } from "../../lib/errors/domain-errors";
import { createKeyValueStorage } from "../../lib/key-value-storage";

export type ShopThemeValues = { accent: string | null; base: string | null; primary: string | null };

const HEX = /^#?([0-9A-Fa-f]{6})$/;
const STRICT_HEX = /^#[0-9A-Fa-f]{6}$/;

export function normalizeThemeColor(value: string): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim();

  if (!trimmed) return { ok: true, value: null };
  const match = HEX.exec(trimmed);

  return match ? { ok: true, value: `#${match[1].toUpperCase()}` } : { ok: false };
}

// Single-shop MVP, like the other shop screens: the first shop is the current one.
export async function getShopTheme(supabase: Pick<SupabaseClient, "from">): Promise<{ input: ShopThemeValues; shopId: string } | null> {
  const { data, error } = await supabase.from("shops").select("id, theme_primary, theme_accent, theme_base").order("name").limit(1);

  if (error) throw error;
  const shop = (data as Array<{ id: string; theme_accent: string | null; theme_base: string | null; theme_primary: string | null }> | null)?.[0];

  return shop ? { input: { accent: shop.theme_accent, base: shop.theme_base, primary: shop.theme_primary }, shopId: shop.id } : null;
}

export async function updateShopTheme(supabase: Pick<SupabaseClient, "from">, shopId: string, input: ShopThemeValues) {
  for (const value of [input.primary, input.accent, input.base]) {
    if (value !== null && !STRICT_HEX.test(value)) throw new Error("Theme colours must be #RRGGBB.");
  }

  const { error } = await supabase
    .from("shops")
    .update({ theme_accent: input.accent, theme_base: input.base, theme_primary: input.primary })
    .eq("id", shopId);

  if (error) throw toDomainError(error);
}

const cacheKey = (userId: string) => `zenc.shop-theme.${userId}`;

export async function readCachedTheme(userId: string): Promise<ThemeInput | null> {
  try {
    const raw = await createKeyValueStorage().getItem(cacheKey(userId));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const pick = (key: string) => (typeof parsed?.[key] === "string" && STRICT_HEX.test(parsed[key] as string) ? (parsed[key] as string) : null);

    return parsed ? { accent: pick("accent"), base: pick("base"), primary: pick("primary") } : null;
  } catch {
    return null;
  }
}

export async function writeCachedTheme(userId: string, input: ThemeInput) {
  try {
    await createKeyValueStorage().setItem(cacheKey(userId), JSON.stringify(input));
  } catch {
    // The cache only avoids a flash of the default colours; losing it is harmless.
  }
}
