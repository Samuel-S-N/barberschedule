import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Button, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  cancelAppointment,
  listMyAppointments,
  rescheduleAppointment,
} from "../../src/features/appointments/lifecycle";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerAppointmentsScreen() {
  const { supabase } = useSupabaseSession();
  const queryClient = useQueryClient();
  const [newStartsAt, setNewStartsAt] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const appointments = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const cancel = useMutation({
    mutationFn: (appointmentId: string) => cancelAppointment(supabase, appointmentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-appointments"] }),
  });
  const reschedule = useMutation({
    mutationFn: ({ appointmentId, startsAt }: { appointmentId: string; startsAt: string }) =>
      rescheduleAppointment(supabase, appointmentId, startsAt),
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to reschedule."),
    onSuccess: () => {
      setFeedback("Appointment rescheduled.");
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
    },
  });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>My appointments</Text>
        <Link href="/book" style={styles.link}>Book an appointment</Link>
        <Link href="/history" style={styles.link}>View history</Link>
        {appointments.isLoading ? <Text>Loading appointments…</Text> : null}
        {appointments.error ? <Text>Unable to load appointments.</Text> : null}
        {feedback ? <Text>{feedback}</Text> : null}
        {appointments.data?.map((appointment) => (
          <View key={appointment.id} style={styles.appointment}>
            <Text>{appointment.serviceNameSnapshot} · {appointment.startsAt}</Text>
            <TextInput
              autoCapitalize="none"
              onChangeText={(value) => setNewStartsAt((current) => ({ ...current, [appointment.id]: value }))}
              placeholder="New start (ISO)"
              style={styles.input}
              value={newStartsAt[appointment.id] ?? ""}
            />
            <Button
              disabled={!newStartsAt[appointment.id] || reschedule.isPending}
              onPress={() => {
                setFeedback(null);
                reschedule.mutate({ appointmentId: appointment.id, startsAt: newStartsAt[appointment.id] });
              }}
              title="Reschedule appointment"
            />
            <Button disabled={cancel.isPending} onPress={() => cancel.mutate(appointment.id)} title="Cancel appointment" />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appointment: { gap: 8 },
  content: { gap: 16, maxWidth: 520, width: "100%" },
  input: { borderColor: "#d1d5db", borderRadius: 8, borderWidth: 1, padding: 12 },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
