import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { createProfessional, setProfessionalActive } from "../api";
import { useOwnerProfessionals } from "./use-owner-professionals";

// "Serve as a professional": the owner gets a professional row linked to their own account, managed through the owner screens.
export function useOwnerAsProfessional() {
  const { profile, supabase } = useSupabaseSession();
  const queryClient = useQueryClient();
  const { professionals, shopId } = useOwnerProfessionals();
  const mine = professionals.data?.list.find((professional) => professional.userId === profile?.userId) ?? null;

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (mine) return setProfessionalActive(supabase, mine.id, on);
      if (!on) return null;

      return createProfessional(supabase, { name: profile?.nickname || profile?.fullName || "Owner", shopId: shopId ?? "", userId: profile?.userId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] }),
  });

  return { active: Boolean(mine?.active), professionalId: mine?.id ?? null, isLoading: professionals.isLoading, toggle };
}
