import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import type { PropsWithChildren } from "react";

import { useSupabaseSession } from "../../providers/AppProviders";
import { getShopBySlug } from "./api";
import type { PublicShop } from "./api";
import { currentShopSlug } from "./host";

export type CurrentShopStatus = "loading" | "ready" | "not-found" | "no-slug" | "error";
type CurrentShopValue = { retry: () => void; shop: PublicShop | null; slug: string | null; status: CurrentShopStatus };

const CurrentShopContext = createContext<CurrentShopValue | null>(null);

// The business this page belongs to, found by the slug in the host. Loaded once; everything shop-bound reads it from here.
export function CurrentShopProvider({ children }: PropsWithChildren) {
  const { supabase } = useSupabaseSession();
  const slug = useMemo(() => currentShopSlug(), []);
  const query = useQuery({ enabled: slug !== null, queryFn: () => getShopBySlug(supabase, slug!), queryKey: ["current-shop", slug], retry: false, staleTime: 5 * 60_000 });

  // Data first: a failed background refetch (tab refocus during a network blip) keeps the shop we already have.
  const status: CurrentShopStatus =
    slug === null ? "no-slug" : query.data !== undefined ? (query.data ? "ready" : "not-found") : query.isError ? "error" : "loading";
  const value = useMemo<CurrentShopValue>(() => ({ retry: () => void query.refetch(), shop: query.data ?? null, slug, status }), [query.data, query.refetch, slug, status]);

  return <CurrentShopContext.Provider value={value}>{children}</CurrentShopContext.Provider>;
}

export function useCurrentShop() {
  const value = useContext(CurrentShopContext);

  if (!value) throw new Error("useCurrentShop must be used inside CurrentShopProvider");

  return value;
}
