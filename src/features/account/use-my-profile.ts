import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { getCurrentProfile } from "../auth/api";

export function useMyProfile() {
  const { session, supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(session),
    queryFn: () => getCurrentProfile(supabase),
    queryKey: ["my-profile", session?.user.id],
  });
}
