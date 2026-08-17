import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { listMyAppointments } from "../../src/features/appointments/lifecycle";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerHistoryScreen() {
  const { supabase } = useSupabaseSession();
  const appointments = useQuery({ queryFn: () => listMyAppointments(supabase, true), queryKey: ["my-appointments", "history"] });

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Appointment history</Text>
        <Link href="/appointments" style={styles.link}>Back to appointments</Link>
        {appointments.isLoading ? <Text>Loading history…</Text> : null}
        {appointments.error ? <Text>Unable to load history.</Text> : null}
        {appointments.data?.map((appointment) => (
          <Text key={appointment.id}>{appointment.serviceNameSnapshot} · {appointment.status} · {appointment.startsAt}</Text>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, maxWidth: 520, width: "100%" },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
