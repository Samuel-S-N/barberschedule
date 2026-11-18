import { Platform } from "react-native";

import { isUnderBaseDomain, resolveCurrentSlug, validShopSlug } from "./resolve-slug";

// Expo inlines `process.env.EXPO_PUBLIC_*` only for literal property reads, so each variable is read by name.
export const shopBaseDomain = () => process.env.EXPO_PUBLIC_SHOP_BASE_DOMAIN || "zencpro.app";

const REMEMBERED_KEY = "zenc.shop";

function remembered(): string | null {
  try {
    return window.sessionStorage.getItem(REMEMBERED_KEY);
  } catch {
    return null;
  }
}

// Web: the slug in the host (see resolveCurrentSlug for the hosted dev address). Native has no host (and ships only after the store
// launch): development uses a fixed slug.
export function currentShopSlug(): string | null {
  const devSlug = process.env.EXPO_PUBLIC_DEV_SHOP_SLUG;

  if (Platform.OS !== "web") return validShopSlug(devSlug);
  if (typeof window === "undefined") return null;

  const baseDomain = shopBaseDomain();
  const slug = resolveCurrentSlug({ baseDomain, devSlug, host: window.location.host, remembered: remembered(), search: window.location.search });

  // Off the base domain a ?shop= choice sticks for the tab, so navigating without the query keeps the shop.
  if (slug && !isUnderBaseDomain(window.location.host, baseDomain) && validShopSlug(new URLSearchParams(window.location.search).get("shop")) === slug && slug !== remembered()) {
    try {
      window.sessionStorage.setItem(REMEMBERED_KEY, slug);
    } catch {
      // sessionStorage can be blocked; the query still works for this page load.
    }
  }

  return slug;
}
