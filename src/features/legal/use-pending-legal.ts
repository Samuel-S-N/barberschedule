import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { listMyConsents } from "./api";
import { pendingKinds, requiredKinds, signupConsents } from "./pending";
import type { LegalKind } from "./types";

// The consents query key: shared with every place that records a consent (see use-accept-legal).
export const consentsQueryKey = (userId: string | undefined) => ["my-consents", userId] as const;

// `setupComplete` is part C's flag (an owner whose business is not open yet accepts the business agreement in the checklist).
export function usePendingLegal(setupComplete = true): { isLoading: boolean; pending: LegalKind[] } {
  const { profile, session, supabase } = useSupabaseSession();
  const query = useQuery({
    enabled: Boolean(session) && Boolean(profile),
    queryFn: () => listMyConsents(supabase),
    queryKey: consentsQueryKey(session?.user.id),
    staleTime: 60_000,
  });

  if (!session || !profile) return { isLoading: false, pending: [] };
  if (query.isPending) return { isLoading: true, pending: [] };
  // A failed lookup must not lock the user out of the app: treat it as "nothing pending" and let the next refetch decide.
  if (query.isError) return { isLoading: false, pending: [] };

  return { isLoading: false, pending: pendingKinds(requiredKinds(profile.role, { setupComplete }), [...query.data, ...signupConsents(session.user.user_metadata)]) };
}
