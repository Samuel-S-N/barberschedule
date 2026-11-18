import { Platform } from "react-native";

import { resolveShopSlug } from "./resolve-slug";

// Expo inlines `process.env.EXPO_PUBLIC_*` only for literal property reads, so each variable is read by name.
export const shopBaseDomain = () => process.env.EXPO_PUBLIC_SHOP_BASE_DOMAIN || "zencpro.app";

// Web: the slug in the host. Native has no host (and ships only after the store launch): development uses a fixed slug.
export function currentShopSlug(): string | null {
  const base = shopBaseDomain();

  if (Platform.OS === "web") return typeof window === "undefined" ? null : resolveShopSlug(window.location.host, base);
  const dev = process.env.EXPO_PUBLIC_DEV_SHOP_SLUG;

  return dev ? resolveShopSlug(`${dev}.${base}`, base) : null;
}
