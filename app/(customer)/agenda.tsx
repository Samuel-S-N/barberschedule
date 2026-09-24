import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";
import { CalendarStrip } from "../../src/components/domain/CalendarStrip";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { groupByLocalDate, markAppointmentDays, pickInitialDate } from "../../src/features/appointments/agenda-view";
import { cancelAppointment, isLifecycleWindowOpen, listMyAppointments } from "../../src/features/appointments/lifecycle";
import type { Appointment } from "../../src/features/appointments/types";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const DAYS_AHEAD = 30;

export default function AgendaScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [segment, setSegment] = useState<"upcoming" | "history">("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const history = useQuery({ queryFn: () => listMyAppointments(supabase, true), queryKey: ["my-appointments", "history"] });
  const toCardProps = useAppointmentCards([...(upcoming.data ?? []), ...(history.data ?? [])]);

  const grouped = useMemo(() => groupByLocalDate(upcoming.data ?? []), [upcoming.data]);
  const days = useMemo(() => markAppointmentDays(buildCalendarStripDays(new Date(), DAYS_AHEAD), grouped), [grouped]);
  const selectedDate = pickedDate ?? pickInitialDate(days, grouped);
  const dayAppointments = grouped.get(selectedDate) ?? [];

  const cancel = useMutation({
    mutationFn: (appointmentId: string) => cancelAppointment(supabase, appointmentId),
    onError: (error) => setFeedback({ message: error instanceof Error ? error.message : "Unable to cancel.", variant: "error" }),
    onSuccess: () => {
      setConfirmingId(null);
      setSelectedId(null);
      setFeedback({ message: "Appointment cancelled.", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    },
  });

  const renderAppointment = (appointment: Appointment, withActions: boolean) => {
    const open = isLifecycleWindowOpen(appointment.startsAt, new Date());

    return (
      <View className="gap-2" key={appointment.id}>
        <AppointmentCard
          {...toCardProps(appointment)}
          onPress={() => setSelectedId(selectedId === appointment.id ? null : appointment.id)}
          testID={`appointment-card-${appointment.id}`}
        />
        {withActions && selectedId === appointment.id ? (
          <View className="gap-2 px-1">
            {!open ? (
              <Text className="text-sm font-sans text-neutral-600">
                Changes are only allowed until 90 minutes before the start.
              </Text>
            ) : null}
            {confirmingId === appointment.id ? (
              <>
                <Button
                  disabled={cancel.isPending}
                  label="Confirm cancellation"
                  onPress={() => cancel.mutate(appointment.id)}
                  testID={`appointment-cancel-confirm-${appointment.id}`}
                  variant="danger"
                />
                <Button label="Keep appointment" onPress={() => setConfirmingId(null)} variant="ghost" />
              </>
            ) : (
              <>
                <Button
                  disabled={!open}
                  label="Reschedule"
                  onPress={() => router.push(
                    `/reschedule?appointmentId=${encodeURIComponent(appointment.id)}&barberId=${encodeURIComponent(appointment.barberId)}&barberServiceId=${encodeURIComponent(appointment.barberServiceId)}`,
                  )}
                  testID={`appointment-reschedule-${appointment.id}`}
                  variant="outline"
                />
                <Button
                  disabled={!open}
                  label="Cancel appointment"
                  onPress={() => setConfirmingId(appointment.id)}
                  testID={`appointment-cancel-${appointment.id}`}
                  variant="danger"
                />
              </>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const loading = segment === "upcoming" ? upcoming.isLoading : history.isLoading;
  const failed = segment === "upcoming" ? upcoming.error : history.error;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">Agenda</Text>
          <View className="w-full max-w-[420px] flex-row gap-2">
            <Button
              label="Upcoming"
              onPress={() => setSegment("upcoming")}
              size="sm"
              testID="agenda-segment-upcoming"
              variant={segment === "upcoming" ? "dark" : "outline"}
            />
            <Button
              label="History"
              onPress={() => setSegment("history")}
              size="sm"
              testID="agenda-segment-history"
              variant={segment === "history" ? "dark" : "outline"}
            />
          </View>
          {segment === "upcoming" ? (
            <View className="w-full">
              <CalendarStrip days={days} onSelectDate={setPickedDate} selectedDate={selectedDate} />
            </View>
          ) : null}
          <View className="w-full max-w-[420px] gap-3">
            {loading ? <SkeletonBlock height={120} width={320} /> : null}
            {failed ? <Text className="text-sm font-sans text-danger-500">Unable to load appointments.</Text> : null}
            {!loading && !failed && segment === "upcoming" && dayAppointments.length === 0 ? (
              <EmptyState title="No appointments this day" />
            ) : null}
            {!loading && !failed && segment === "history" && (history.data?.length ?? 0) === 0 ? (
              <EmptyState title="No past appointments yet" />
            ) : null}
            {segment === "upcoming"
              ? dayAppointments.map((appointment) => renderAppointment(appointment, true))
              : (history.data ?? []).map((appointment) => renderAppointment(appointment, false))}
          </View>
          <Toast
            message={feedback?.message ?? ""}
            onDismiss={() => setFeedback(null)}
            variant={feedback?.variant ?? "info"}
            visible={feedback !== null}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
