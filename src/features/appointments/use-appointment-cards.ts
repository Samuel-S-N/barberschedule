import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AppointmentCardProps } from "../../components/domain/AppointmentCard";
import { useLanguage } from "../../i18n/use-language";
import { useSupabaseSession } from "../../providers/AppProviders";
import { listPublicProfessionals } from "../professionals/api";
import { listPublicShops } from "../shops/api";
import { formatAppointmentLabels } from "./agenda-view";
import type { Appointment } from "./types";

export function useAppointmentCards(appointments: Appointment[]) {
  const { supabase } = useSupabaseSession();
  const { t } = useTranslation();
  const language = useLanguage();
  // Single-shop MVP: every appointment belongs to the same shop.
  const shopId = appointments[0]?.shopId ?? "";
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const professionals = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicProfessionals(supabase, shopId),
    queryKey: ["public-professionals", shopId],
  });

  return (appointment: Appointment): Omit<AppointmentCardProps, "onPress" | "testID"> => ({
    ...formatAppointmentLabels(appointment, language),
    professionalName: professionals.data?.find((professional) => professional.id === appointment.professionalId)?.name ?? t("appointments.fallbackProfessional"),
    serviceName: appointment.serviceNameSnapshot,
    shopName: shops.data?.find((shop) => shop.id === appointment.shopId)?.name ?? t("appointments.fallbackShop"),
    status: appointment.status,
  });
}
