import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "../shops/CurrentShopProvider";
import { countUnread } from "./inbox-api";

// Polls while the app is open; coming back to the foreground refetches too (see query-focus).
export function useUnreadCount() {
  const { profile, supabase } = useSupabaseSession();
  const shopId = useCurrentShop().shop?.id ?? "";

  return useQuery({
    enabled: Boolean(profile) && Boolean(shopId),
    queryFn: () => countUnread(supabase, shopId),
    queryKey: ["notifications-unread", profile?.userId, shopId],
    refetchInterval: 30_000,
  });
}
