import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { countUnread } from "./inbox-api";

// Polls while the app is open; coming back to the foreground refetches too (see query-focus).
export function useUnreadCount() {
  const { profile, supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(profile),
    queryFn: () => countUnread(supabase),
    queryKey: ["notifications-unread", profile?.userId],
    refetchInterval: 30_000,
  });
}
