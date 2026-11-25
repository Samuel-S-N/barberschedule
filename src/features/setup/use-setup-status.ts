import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { useOwnerShopId } from "../shops/use-owner-shop-id";
import { getShopSetupStatus } from "./api";

export function useSetupStatus() {
  const { profile, supabase } = useSupabaseSession();
  const shopId = useOwnerShopId().data ?? null;

  return useQuery({
    enabled: profile?.role === "owner" && shopId !== null,
    queryFn: () => getShopSetupStatus(supabase, shopId ?? ""),
    queryKey: ["shop-setup-status", shopId],
    retry: false,
  });
}
