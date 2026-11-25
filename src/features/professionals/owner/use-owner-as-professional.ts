import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { listOwnerWorkingPeriods } from "../../schedule/api";
import { copyShopHoursToProfessional } from "../../schedule/copy-shop-hours";
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
      let professionalId = mine?.id ?? null;

      if (mine) await setProfessionalActive(supabase, mine.id, on);
      else if (on) professionalId = (await createProfessional(supabase, { name: profile?.nickname || profile?.fullName || "Owner", shopId: shopId ?? "", userId: profile?.userId })).id;
      else return null;

      // First time only: a professional with no working periods at all gets the shop's hours. Never again, never over existing hours.
      if (on && professionalId && shopId) {
        const periods = await listOwnerWorkingPeriods(supabase, shopId);

        if (!periods.some((period) => period.professionalId === professionalId)) return { copied: await copyShopHoursToProfessional(supabase, shopId, professionalId), professionalId };
      }

      return { copied: 0, professionalId };
    },
    // Settled, not only successful: a copy that failed midway still left periods the schedule and the guide must show.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-professional-services"] });
    },
  });

  return { active: Boolean(mine?.active), professionalId: mine?.id ?? null, isLoading: professionals.isLoading, toggle };
}
