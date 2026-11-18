import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AppointmentCardProps } from "../../components/domain/AppointmentCard";
import { useLanguage } from "../../i18n/use-language";
import { useSupabaseSession } from "../../providers/AppProviders";
import { listPublicProfessionals } from "../professionals/api";
import { useCurrentShop } from "../shops/CurrentShopProvider";
import { formatAppointmentLabels } from "./agenda-view";
import type { Appointment } from "./types";

export function useAppointmentCards(appointments: Appointment[]) {
  const { supabase } = useSupabaseSession();
  const { t } = useTranslation();
  const language = useLanguage();
  // Appointments are listed per shop, so every row belongs to the current one.
  const { shop } = useCurrentShop();
  const shopId = shop?.id ?? appointments[0]?.shopId ?? "";
  const professionals = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicProfessionals(supabase, shopId),
    queryKey: ["public-professionals", shopId],
  });

  return (appointment: Appointment): Omit<AppointmentCardProps, "onPress" | "testID"> => ({
    ...formatAppointmentLabels(appointment, language),
    professionalName: professionals.data?.find((professional) => professional.id === appointment.professionalId)?.name ?? t("appointments.fallbackProfessional"),
    serviceName: appointment.serviceNameSnapshot,
    shopName: shop?.name ?? t("appointments.fallbackShop"),
    status: appointment.status,
  });
}
