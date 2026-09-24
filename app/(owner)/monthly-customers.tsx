import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { listOwnerBarberServices } from "../../src/features/services/api";
import type { BarberService } from "../../src/features/services/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import type { Customer } from "../../src/features/customers/types";
import { listMonthlyCustomers } from "../../src/features/customers/monthly-api";
import {
  cancelRecurrenceOccurrence,
  createRecurrenceSeries,
  editRecurrenceSeries,
  endRecurrenceSeries,
  ensureRecurrenceWindow,
  setRecurrenceSeriesActive,
} from "../../src/features/recurrence/api";
import type { RecurrenceSeries } from "../../src/features/recurrence/types";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

type ShopRow = { id: string };

function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function loadShopId(supabase: ReturnType<typeof useSupabaseSession>["supabase"]) {
  const { data, error } = await supabase.from("shops").select("id").order("name", { ascending: true });
  if (error) throw error;
  return (data as ShopRow[] | null)?.[0]?.id ?? null;
}

export default function MonthlyCustomersScreen() {
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [barberServices, setBarberServices] = useState<BarberService[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editing, setEditing] = useState<RecurrenceSeries | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [intervalWeeks, setIntervalWeeks] = useState("4");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [localStartDate, setLocalStartDate] = useState(today);
  const [localStartTime, setLocalStartTime] = useState("09:00");
  const [occurrenceDate, setOccurrenceDate] = useState(today);
  const [selectedBarberServiceId, setSelectedBarberServiceId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [series, setSeries] = useState<RecurrenceSeries[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);
  const [specialPriceCents, setSpecialPriceCents] = useState("");

  const refresh = async (targetShopId = shopId) => {
    if (!targetShopId) return;
    setSeries(await listMonthlyCustomers(supabase, targetShopId));
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const nextShopId = await loadShopId(supabase);
        if (!nextShopId) throw new Error("No shop found.");
        const [nextCustomers, nextBarberServices, nextSeries] = await Promise.all([
          listOwnerCustomers(supabase, nextShopId),
          listOwnerBarberServices(supabase, nextShopId),
          listMonthlyCustomers(supabase, nextShopId),
        ]);
        if (!active) return;
        setShopId(nextShopId);
        setCustomers(nextCustomers.filter((customer) => customer.active));
        setBarberServices(nextBarberServices.filter((service) => service.active));
        setSeries(nextSeries);
      } catch (error) {
        if (active) setFeedback(error instanceof Error ? error.message : "Unable to load recurring customers.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [supabase]);

  const resetForm = () => {
    setEditing(null);
    setIntervalWeeks("4");
    setLocalStartDate(today);
    setLocalStartTime("09:00");
    setSpecialPriceCents("");
  };

  const save = async () => {
    const interval = Number(intervalWeeks);
    const specialPrice = specialPriceCents.trim() === "" ? null : Number(specialPriceCents);
    if (!shopId || !Number.isInteger(interval) || interval <= 0 || !Number.isInteger(specialPrice ?? 0) || (specialPrice ?? 0) < 0) {
      setFeedback("Use a positive interval and a non-negative special price.");
      return;
    }
    if (!editing && (!selectedCustomerId || !selectedBarberServiceId)) {
      setFeedback("Choose a customer and service.");
      return;
    }

    setFeedback(null);
    setIsSaving(true);
    try {
      if (editing) {
        await editRecurrenceSeries(supabase, editing.id, {
          endsOn: editing.endsOn,
          intervalWeeks: interval,
          localStartTime,
          specialPriceCents: specialPrice,
        });
      } else {
        await createRecurrenceSeries(supabase, {
          barberServiceId: selectedBarberServiceId!,
          customerId: selectedCustomerId!,
          intervalWeeks: interval,
          localStartDate,
          localStartTime,
          specialPriceCents: specialPrice,
        });
      }
      await ensureRecurrenceWindow(supabase, shopId, addDays(today, 90));
      await refresh(shopId);
      setFeedback(editing ? "Recurring booking updated." : "Recurring booking saved.");
      resetForm();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to save recurring booking.");
    } finally {
      setIsSaving(false);
    }
  };

  const mutate = async (operation: () => Promise<unknown>) => {
    setFeedback(null);
    setIsSaving(true);
    try {
      await operation();
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to update recurring booking.");
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (item: RecurrenceSeries) => {
    setEditing(item);
    setIntervalWeeks(String(item.intervalWeeks));
    setLocalStartTime(item.localStartTime);
    setSpecialPriceCents(item.specialPriceCents === null ? "" : String(item.specialPriceCents));
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Recurring customers</Text>
        <Link href="/recurrence-conflicts" style={styles.link}>Recurrence conflicts</Link>
        <Text style={styles.note}>Edits preserve every materialized occurrence; only later materialization uses the new rule.</Text>
        {!editing ? <>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={styles.controls}>{customers.map((customer) => <Button color={customer.id === selectedCustomerId ? "#2563eb" : undefined} key={customer.id} onPress={() => setSelectedCustomerId(customer.id)} title={customer.fullName} />)}</View>
          <Text style={styles.sectionTitle}>Service</Text>
          <View style={styles.controls}>{barberServices.map((service) => <Button color={service.id === selectedBarberServiceId ? "#2563eb" : undefined} key={service.id} onPress={() => setSelectedBarberServiceId(service.id)} title={`Service ${service.id}`} />)}</View>
          <TextInput onChangeText={setLocalStartDate} placeholder="Start date (YYYY-MM-DD)" style={styles.input} testID="recurrence-start-date" value={localStartDate} />
        </> : <Text style={styles.note}>Editing {editing.customerName || "this customer"}; the original local start date is preserved.</Text>}
        <TextInput keyboardType="number-pad" onChangeText={setIntervalWeeks} placeholder="Every N weeks" style={styles.input} value={intervalWeeks} />
        <TextInput onChangeText={setLocalStartTime} placeholder="Local time (HH:mm)" style={styles.input} value={localStartTime} />
        <TextInput keyboardType="number-pad" onChangeText={setSpecialPriceCents} placeholder="Special price cents (optional)" style={styles.input} value={specialPriceCents} />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        <Button disabled={isSaving} onPress={() => void save()} title={editing ? "Save recurrence" : "Create recurrence"} />
        {editing ? <Button disabled={isSaving} onPress={resetForm} title="Cancel edit" /> : null}
        <Text style={styles.sectionTitle}>Series</Text>
        <TextInput onChangeText={setOccurrenceDate} placeholder="Occurrence date (YYYY-MM-DD)" style={styles.input} value={occurrenceDate} />
        {series.map((item) => <View key={item.id} style={styles.card}>
          <Text style={styles.name}>{item.customerName || item.customerId} · every {item.intervalWeeks} week(s)</Text>
          <Text>{item.localStartDate} · {item.localStartTime} · {item.specialPriceCents === null ? "catalog price" : `${item.specialPriceCents} cents`} · {item.active ? "active" : "inactive"}</Text>
          <View style={styles.controls}>
            <Button disabled={isSaving} onPress={() => startEdit(item)} title="Edit" />
            {item.active ? <Button disabled={isSaving} onPress={() => void mutate(() => setRecurrenceSeriesActive(supabase, item.id, false))} title="Deactivate" /> : null}
            <Button disabled={isSaving} onPress={() => void mutate(() => cancelRecurrenceOccurrence(supabase, item.id, occurrenceDate))} title="Cancel occurrence" />
            <Button disabled={isSaving || !item.active} onPress={() => void mutate(() => endRecurrenceSeries(supabase, item.id))} title="End series" />
          </View>
        </View>)}
      </ScrollView>
    </Screen>
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
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "700", marginTop: 12 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
