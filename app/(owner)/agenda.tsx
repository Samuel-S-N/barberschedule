import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { listOwnerAgenda, listOwnerAgendaOverrides } from "../../src/features/appointments/agenda-query";
import { setOwnerAppointmentStatus } from "../../src/features/appointments/owner-api";
import { cancelAppointment } from "../../src/features/appointments/lifecycle";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type AgendaView = "day" | "week" | "month";
type ShopRow = { id: string };

async function loadShopId(supabase: ReturnType<typeof useSupabaseSession>["supabase"]) {
  const { data, error } = await supabase.from("shops").select("id").order("name", { ascending: true });

  if (error) throw error;
  return (data as ShopRow[] | null)?.[0]?.id ?? null;
}

function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function agendaRange(localDate: string, view: AgendaView) {
  if (view === "day") return { end: localDate, label: `Day: ${localDate}`, start: localDate };
  if (view === "week") return { end: addDays(localDate, 6), label: `Week: ${localDate}`, start: localDate };
  return { end: addDays(localDate, 30), label: `Month: ${localDate}`, start: localDate };
}

export default function OwnerAgendaScreen() {
  const { supabase } = useSupabaseSession();
  const [appointments, setAppointments] = useState<Awaited<ReturnType<typeof listOwnerAgenda>>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [localDate, setLocalDate] = useState(formatInstantInShopTime(new Date()).localDate);
  const [offset, setOffset] = useState(0);
  const [overrides, setOverrides] = useState<Awaited<ReturnType<typeof listOwnerAgendaOverrides>>>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [view, setView] = useState<AgendaView>("day");
  const range = useMemo(() => agendaRange(localDate, view), [localDate, view]);

  const refresh = async (targetShopId = shopId) => {
    if (!targetShopId) return;
    const [nextAppointments, nextOverrides] = await Promise.all([
      listOwnerAgenda(supabase, { limit: 100, offset, rangeEnd: range.end, rangeStart: range.start, shopId: targetShopId }),
      listOwnerAgendaOverrides(supabase, { rangeEnd: range.end, rangeStart: range.start, shopId: targetShopId }),
    ]);
    setAppointments(nextAppointments);
    setOverrides(nextOverrides);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextShopId = await loadShopId(supabase);
        if (!active) return;
        setShopId(nextShopId);
        if (!nextShopId) {
          setFeedback("No shop found.");
          return;
        }
        await refresh(nextShopId);
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : "Unable to load agenda.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [offset, range.end, range.start, supabase]);

  const updateStatus = async (appointmentId: string, status: "completed" | "no_show" | "cancelled") => {
    setFeedback(null);
    setIsSaving(true);
    try {
      if (status === "cancelled") await cancelAppointment(supabase, appointmentId);
      else await setOwnerAppointmentStatus(supabase, appointmentId, status);
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to update appointment.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectView = (nextView: AgendaView) => {
    setOffset(0);
    setView(nextView);
  };

  const moveRange = (direction: -1 | 1) => {
    const days = view === "week" ? 7 : view === "month" ? 31 : 1;
    setOffset(0);
    setLocalDate((date) => addDays(date, direction * days));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Owner agenda</Text>
        <Link href="/appointment-form" style={styles.link}>New appointment</Link>
        <Text style={styles.note}>Free times and blocks are enforced by the booking availability check.</Text>
        <TextInput onChangeText={(value) => { setLocalDate(value); setOffset(0); }} placeholder="Local date (YYYY-MM-DD)" style={styles.input} value={localDate} />
        <View style={styles.controls}>
          {(["day", "week", "month"] as const).map((item) => (
            <Button key={item} color={view === item ? "#2563eb" : undefined} onPress={() => selectView(item)} title={`${item[0].toUpperCase()}${item.slice(1)}`} />
          ))}
        </View>
        <View style={styles.controls}>
          <Button disabled={isLoading} onPress={() => moveRange(-1)} title="Previous range" />
          <Button disabled={isLoading} onPress={() => moveRange(1)} title="Next range" />
        </View>
        <Text style={styles.note}>{range.label}</Text>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        {appointments.map((appointment) => (
          <View key={appointment.id} style={styles.card}>
            <Text style={styles.name}>{appointment.customerName} · {appointment.serviceNameSnapshot}</Text>
            <Text>{appointment.barberName} · {appointment.startsAt} · {appointment.status}</Text>
            {appointment.status === "scheduled" || appointment.status === "confirmed" ? (
              <View style={styles.controls}>
                <Button disabled={isSaving} onPress={() => void updateStatus(appointment.id, "completed")} title="Complete" />
                <Button disabled={isSaving} onPress={() => void updateStatus(appointment.id, "no_show")} title="No-show" />
                <Button disabled={isSaving} onPress={() => void updateStatus(appointment.id, "cancelled")} title="Cancel" />
              </View>
            ) : null}
          </View>
        ))}
        {overrides.map((override) => (
          <View key={override.id} style={styles.card}>
            <Text style={styles.name}>{override.barberName} · {override.kind}</Text>
            <Text>{override.localDate} · {override.startTime ? `${override.startTime}–${override.endTime}` : "all day"}</Text>
          </View>
        ))}
        <View style={styles.controls}>
          <Button disabled={offset === 0 || isLoading} onPress={() => setOffset(Math.max(0, offset - 100))} title="Previous page" />
          <Button disabled={appointments.length < 100 || isLoading} onPress={() => setOffset(offset + 100)} title="Next page" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: "#d1d5db", borderRadius: 12, borderWidth: 1, gap: 8, padding: 12 },
  content: { gap: 12, padding: 24 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  feedback: { color: "#b91c1c" },
  input: { borderColor: "#d1d5db", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  link: { color: "#2563eb", fontSize: 16 },
  name: { color: "#111827", fontSize: 16, fontWeight: "600" },
  note: { color: "#4b5563" },
  screen: { backgroundColor: "#fff", flex: 1 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
