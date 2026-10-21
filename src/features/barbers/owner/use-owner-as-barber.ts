import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabaseSession } from "../../../providers/AppProviders";
import { createBarber, setBarberActive } from "../api";
import { useOwnerBarbers } from "./use-owner-barbers";

// "Serve as a barber": the owner gets a barber row linked to their own account, managed through the owner screens.
export function useOwnerAsBarber() {
  const { profile, supabase } = useSupabaseSession();
  const queryClient = useQueryClient();
  const { barbers, shopId } = useOwnerBarbers();
  const mine = barbers.data?.list.find((barber) => barber.userId === profile?.userId) ?? null;

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (mine) return setBarberActive(supabase, mine.id, on);
      if (!on) return null;

      return createBarber(supabase, { name: profile?.nickname || profile?.fullName || "Owner", shopId: shopId ?? "", userId: profile?.userId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-barbers"] }),
  });

  return { active: Boolean(mine?.active), barberId: mine?.id ?? null, isLoading: barbers.isLoading, toggle };
}
