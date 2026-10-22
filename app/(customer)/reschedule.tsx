import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";
import { listMyAppointments, rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { RescheduleFlow } from "../../src/features/appointments/RescheduleFlow";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// The customer's reschedule: date › time › review, with the step bar on top (see RescheduleFlow).
export default function RescheduleScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string; barberId?: string; barberServiceId?: string }>();
  const appointmentId = param(params.appointmentId);
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();

  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const current = upcoming.data?.find((appointment) => appointment.id === appointmentId);
  const toCardProps = useAppointmentCards(current ? [current] : []);
  const cardProps = current ? toCardProps(current) : null;
  const currentSlot = current ? formatInstantInShopTime(new Date(current.startsAt)) : null;

  return (
    <RescheduleFlow
      barberId={param(params.barberId)}
      barberServiceId={param(params.barberServiceId)}
      current={currentSlot}
      currentCard={cardProps ? <AppointmentCard {...cardProps} testID="reschedule-current" /> : null}
      onExit={back}
      onMoved={async () => {
        await queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
        // dismissTo pops back to the tabs already underneath; replace would mount a second tab navigator.
        router.dismissTo("/appointments");
      }}
      submit={(startsAt) => rescheduleAppointment(supabase, appointmentId, startsAt)}
      summaryRows={[
        [t("book.summary.service"), cardProps?.serviceName ?? ""],
        [t("book.summary.barber"), cardProps?.barberName ?? ""],
      ]}
      testPrefix="reschedule"
    />
  );
}
