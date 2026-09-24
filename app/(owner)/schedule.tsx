import { useEffect, useState } from "react";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  deleteScheduleOverride,
  deleteWorkingPeriod,
  createScheduleOverride,
  createWorkingPeriod,
  listOwnerScheduleOverrides,
  listOwnerWorkingPeriods,
} from "../../src/features/schedule/api";
import type {
  ScheduleOverrideKind,
  WorkingPeriod,
} from "../../src/features/schedule/types";
import {
  assertNoOverlappingWorkingPeriod,
  parseWorkingPeriodInput,
} from "../../src/features/schedule/validation";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

type ShopRow = { id: string };

async function loadShopId(supabase: ReturnType<typeof useSupabaseSession>["supabase"]) {
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as ShopRow[] | null)?.[0]?.id ?? null;
}

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function OwnerScheduleScreen() {
  const { supabase } = useSupabaseSession();
  const [barbers, setBarbers] = useState<OwnerBarber[]>([]);
  const [endTime, setEndTime] = useState("18:00");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isAllDayBlock, setIsAllDayBlock] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [localDate, setLocalDate] = useState(
    formatInstantInShopTime(new Date()).localDate,
  );
  const [overrideEndTime, setOverrideEndTime] = useState("18:00");
  const [overrideKind, setOverrideKind] = useState<ScheduleOverrideKind>("block");
  const [overrideStartTime, setOverrideStartTime] = useState("16:00");
  const [overrides, setOverrides] = useState<Awaited<ReturnType<typeof listOwnerScheduleOverrides>>>([]);
  const [periods, setPeriods] = useState<WorkingPeriod[]>([]);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [weekday, setWeekday] = useState("1");

  const refresh = async (targetShopId = shopId) => {
    if (!targetShopId) {
      return;
    }

    const [nextPeriods, nextOverrides] = await Promise.all([
      listOwnerWorkingPeriods(supabase, targetShopId),
      listOwnerScheduleOverrides(supabase, targetShopId),
    ]);
    setPeriods(nextPeriods);
    setOverrides(nextOverrides);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextShopId = await loadShopId(supabase);

        if (!active) {
          return;
        }

        setShopId(nextShopId);

        if (!nextShopId) {
          setFeedback("No shop found.");
          return;
        }

        const nextBarbers = await listOwnerBarbers(supabase, nextShopId);

        if (!active) {
          return;
        }

        setBarbers(nextBarbers);
        setSelectedBarberId(nextBarbers[0]?.id ?? null);
        await refresh(nextShopId);
      } catch (error) {
        if (active) {
          setFeedback(error instanceof Error ? error.message : "Unable to load schedule.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  const selectedPeriods = periods.filter((period) => period.barberId === selectedBarberId);
  const selectedOverrides = overrides.filter((override) => override.barberId === selectedBarberId);
  const selectedBarber = barbers.find((barber) => barber.id === selectedBarberId);
  const showOverrideTimes = overrideKind === "opening" || !isAllDayBlock;

  const handleAddPeriod = async () => {
    if (!shopId || !selectedBarberId) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const input = parseWorkingPeriodInput({
        barberId: selectedBarberId,
        endTime,
        shopId,
        startTime,
        weekday: Number(weekday),
      });
      assertNoOverlappingWorkingPeriod(input, selectedPeriods);
      await createWorkingPeriod(supabase, input);
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to add working period.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddOverride = async () => {
    if (!shopId || !selectedBarberId) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      await createScheduleOverride(supabase, {
        barberId: selectedBarberId,
        endTime: showOverrideTimes ? overrideEndTime : null,
        kind: overrideKind,
        localDate,
        shopId,
        startTime: showOverrideTimes ? overrideStartTime : null,
      });
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to add override.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (remove: () => Promise<void>) => {
    setFeedback(null);
    setIsSaving(true);

    try {
      await remove();
      await refresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unable to remove schedule item.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Owner schedule
        </Text>
        <Text style={styles.note}>
          Working periods repeat weekly. Overrides are local shop dates; availability is Task 5.
        </Text>
        <View style={styles.barberList}>
          {barbers.map((barber) => (
            <Button
              accessibilityState={{ selected: barber.id === selectedBarberId }}
              color={barber.id === selectedBarberId ? "#2563eb" : undefined}
              key={barber.id}
              onPress={() => setSelectedBarberId(barber.id)}
              title={barber.id === selectedBarberId ? `${barber.name} (selected)` : barber.name}
            />
          ))}
        </View>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        {!selectedBarber ? <Text style={styles.note}>Add a barber before creating a schedule.</Text> : null}
        {selectedBarber ? (
          <>
            <Text style={styles.note}>Selected barber: {selectedBarber.name}</Text>
            <Text style={styles.sectionTitle}>Weekly working periods — {selectedBarber.name}</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setWeekday}
              placeholder="Weekday 1-7 (Monday-Sunday)"
              style={styles.input}
              value={weekday}
            />
            <TextInput
              onChangeText={setStartTime}
              placeholder="Start time (HH:mm)"
              style={styles.input}
              value={startTime}
            />
            <TextInput
              onChangeText={setEndTime}
              placeholder="End time (HH:mm)"
              style={styles.input}
              value={endTime}
            />
            <Button disabled={isSaving} onPress={handleAddPeriod} title="Add working period" />
            {selectedPeriods.map((period) => (
              <View key={period.id} style={styles.card}>
                <Text>{weekdays[period.weekday - 1]} · {period.startTime}–{period.endTime}</Text>
                <Button
                  disabled={isSaving}
                  onPress={() => void handleDelete(() => deleteWorkingPeriod(supabase, period.id))}
                  title="Remove"
                />
              </View>
            ))}

            <Text style={styles.sectionTitle}>Date overrides</Text>
            <TextInput
              onChangeText={setLocalDate}
              placeholder="Local date (YYYY-MM-DD)"
              style={styles.input}
              value={localDate}
            />
            <View style={styles.barberList}>
              <Button
                accessibilityState={{ selected: overrideKind === "block" }}
                color={overrideKind === "block" ? "#2563eb" : undefined}
                onPress={() => setOverrideKind("block")}
                title={overrideKind === "block" ? "Block time (selected)" : "Block time"}
              />
              <Button
                accessibilityState={{ selected: overrideKind === "opening" }}
                color={overrideKind === "opening" ? "#2563eb" : undefined}
                onPress={() => setOverrideKind("opening")}
                title={overrideKind === "opening" ? "Extra opening (selected)" : "Extra opening"}
              />
            </View>
            {overrideKind === "block" ? (
              <View style={styles.barberList}>
                <Button
                  accessibilityState={{ selected: isAllDayBlock }}
                  color={isAllDayBlock ? "#2563eb" : undefined}
                  onPress={() => setIsAllDayBlock(true)}
                  title={isAllDayBlock ? "All day (selected)" : "All day"}
                />
                <Button
                  accessibilityState={{ selected: !isAllDayBlock }}
                  color={!isAllDayBlock ? "#2563eb" : undefined}
                  onPress={() => setIsAllDayBlock(false)}
                  title={!isAllDayBlock ? "Timed block (selected)" : "Timed block"}
                />
              </View>
            ) : null}
            {showOverrideTimes ? (
              <>
                <TextInput
                  onChangeText={setOverrideStartTime}
                  placeholder="Start time (HH:mm)"
                  style={styles.input}
                  value={overrideStartTime}
                />
                <TextInput
                  onChangeText={setOverrideEndTime}
                  placeholder="End time (HH:mm)"
                  style={styles.input}
                  value={overrideEndTime}
                />
              </>
            ) : null}
            <Button disabled={isSaving} onPress={handleAddOverride} title="Add override" />
            {selectedOverrides.map((override) => (
              <View key={override.id} style={styles.card}>
                <Text>
                  {override.localDate} · {override.kind} · {override.startTime
                    ? `${override.startTime}–${override.endTime}`
                    : "all day"}
                </Text>
                <Button
                  disabled={isSaving}
                  onPress={() => void handleDelete(() => deleteScheduleOverride(supabase, override.id))}
                  title="Remove"
                />
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  barberList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  card: {
    borderColor: "#d1d5db",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  content: {
    gap: 12,
    padding: 24,
  },
  feedback: {
    color: "#b91c1c",
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  note: {
    color: "#4b5563",
  },
  screen: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    marginTop: 12,
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "700",
  },
});
