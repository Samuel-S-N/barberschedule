import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getAvailableSlots } from "../../src/features/availability/api";
import { bookOwnerAppointment } from "../../src/features/appointments/owner-api";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import type { Customer } from "../../src/features/customers/types";
import { listOwnerBarberServices, listOwnerServices } from "../../src/features/services/api";
import type { BarberService, Service } from "../../src/features/services/types";
import type { AvailableSlot } from "../../src/features/availability/types";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

type ShopRow = { id: string };

async function loadShopId(supabase: ReturnType<typeof useSupabaseSession>["supabase"]) {
  const { data, error } = await supabase.from("shops").select("id").order("name", { ascending: true });

  if (error) throw error;
  return (data as ShopRow[] | null)?.[0]?.id ?? null;
}

export default function OwnerAppointmentFormScreen() {
  const { supabase } = useSupabaseSession();
  const [barbers, setBarbers] = useState<OwnerBarber[]>([]);
  const [barberServices, setBarberServices] = useState<BarberService[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [localDate, setLocalDate] = useState(formatInstantInShopTime(new Date()).localDate);
  const [notes, setNotes] = useState("");
  const [selectedBarberServiceId, setSelectedBarberServiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const shopId = await loadShopId(supabase);
        if (!shopId) throw new Error("No shop found.");
        const [nextBarbers, nextBarberServices, nextCustomers, nextServices] = await Promise.all([
          listOwnerBarbers(supabase, shopId),
          listOwnerBarberServices(supabase, shopId),
          listOwnerCustomers(supabase, shopId),
          listOwnerServices(supabase, shopId),
        ]);
        if (!active) return;
        setBarbers(nextBarbers.filter((barber: OwnerBarber) => barber.active));
        setBarberServices(nextBarberServices.filter((barberService) => barberService.active));
        setCustomers(nextCustomers.filter((customer) => customer.active));
        setServices(nextServices.filter((service) => service.active));
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : "Unable to load appointment form.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [supabase]);

  const selectedBarberService = barberServices.find((item) => item.id === selectedBarberServiceId) ?? null;
  const choices = useMemo(() => barberServices.map((barberService) => ({
    barber: barbers.find((barber) => barber.id === barberService.barberId),
    barberService,
    service: services.find((service) => service.id === barberService.serviceId),
  })).filter((choice) => choice.barber && choice.service), [barbers, barberServices, services]);

  const loadSlots = async () => {
    if (!selectedBarberService) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      setSlots(await getAvailableSlots(supabase, {
        barberId: selectedBarberService.barberId,
        barberServiceId: selectedBarberService.id,
        localDate,
      }));
      setSelectedStartsAt(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to load available times.");
    } finally {
      setIsSaving(false);
    }
  };

  const createAppointment = async () => {
    if (!selectedBarberServiceId || !selectedCustomerId || !selectedStartsAt) return;
    setFeedback(null);
    setIsSaving(true);
    try {
      await bookOwnerAppointment(supabase, {
        barberServiceId: selectedBarberServiceId,
        customerId: selectedCustomerId,
        notes: notes.trim() || null,
        startsAt: selectedStartsAt,
      });
      setFeedback("Appointment created.");
      setSlots([]);
      setSelectedStartsAt(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to create appointment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>New owner appointment</Text>
        <Link href="/agenda" style={styles.link}>Back to agenda</Link>
        <Text style={styles.sectionTitle}>Customer</Text>
        <View style={styles.controls}>{customers.map((customer) => <Button color={customer.id === selectedCustomerId ? "#2563eb" : undefined} key={customer.id} onPress={() => setSelectedCustomerId(customer.id)} title={customer.fullName} />)}</View>
        <Text style={styles.sectionTitle}>Service</Text>
        <View style={styles.controls}>{choices.map(({ barber, barberService, service }) => <Button color={barberService.id === selectedBarberServiceId ? "#2563eb" : undefined} key={barberService.id} onPress={() => setSelectedBarberServiceId(barberService.id)} title={`${barber?.name} · ${service?.name}`} />)}</View>
        <TextInput onChangeText={setLocalDate} placeholder="Local date (YYYY-MM-DD)" style={styles.input} testID="owner-appointment-date" value={localDate} />
        <Button disabled={!selectedBarberService || isSaving} onPress={() => void loadSlots()} title="Load available times" />
        <View style={styles.controls}>{slots.map((slot) => <Button color={slot.startsAt === selectedStartsAt ? "#2563eb" : undefined} key={slot.startsAt} onPress={() => setSelectedStartsAt(slot.startsAt)} title={slot.localTime} />)}</View>
        <TextInput onChangeText={setNotes} placeholder="Notes (optional)" style={styles.input} value={notes} />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        <Button disabled={!selectedBarberServiceId || !selectedCustomerId || !selectedStartsAt || isSaving} onPress={() => void createAppointment()} title="Create appointment" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, padding: 24 },
  controls: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  feedback: { color: "#b91c1c" },
  input: { borderColor: "#d1d5db", borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  link: { color: "#2563eb", fontSize: 16 },
  screen: { backgroundColor: "#fff", flex: 1 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "700", marginTop: 12 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
