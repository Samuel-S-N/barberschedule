import { useQuery } from "@tanstack/react-query";

import type { AppointmentCardProps } from "../../components/domain/AppointmentCard";
import { useSupabaseSession } from "../../providers/AppProviders";
import { listPublicBarbers } from "../barbers/api";
import { listPublicShops } from "../shops/api";
import { formatAppointmentLabels } from "./agenda-view";
import type { Appointment } from "./types";

export function useAppointmentCards(appointments: Appointment[]) {
  const { supabase } = useSupabaseSession();
  // Single-shop MVP: every appointment belongs to the same shop.
  const shopId = appointments[0]?.shopId ?? "";
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const barbers = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicBarbers(supabase, shopId),
    queryKey: ["public-barbers", shopId],
  });

  return (appointment: Appointment): Omit<AppointmentCardProps, "onPress" | "testID"> => ({
    ...formatAppointmentLabels(appointment),
    barberName: barbers.data?.find((barber) => barber.id === appointment.barberId)?.name ?? "Barber",
    serviceName: appointment.serviceNameSnapshot,
    shopName: shops.data?.find((shop) => shop.id === appointment.shopId)?.name ?? "Barbershop",
    status: appointment.status,
  });
}
