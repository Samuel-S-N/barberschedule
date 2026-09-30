import { useQuery } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { getCurrentProfile } from "../auth/api";
import { AVATAR_BUCKET } from "./avatar";

export function useMyProfile() {
  const { session, supabase } = useSupabaseSession();

  return useQuery({
    enabled: Boolean(session),
    queryFn: () => getCurrentProfile(supabase),
    queryKey: ["my-profile", session?.user.id],
    select: (profile) =>
      profile && {
        ...profile,
        avatarUrl: profile.avatarPath ? supabase.storage.from(AVATAR_BUCKET).getPublicUrl(profile.avatarPath).data.publicUrl : null,
      },
  });
}
