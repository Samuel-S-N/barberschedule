import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { errorMessage } from "../../src/i18n/errors";
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

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export default function OwnerScheduleScreen() {
  const { t } = useTranslation();
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
          setFeedback(t("common.noShop"));
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
          setFeedback(errorMessage(error, t as never, t("owner.schedule.loadError")));
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
      setFeedback(errorMessage(error, t as never, t("owner.schedule.addPeriodError")));
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
      setFeedback(errorMessage(error, t as never, t("owner.schedule.addOverrideError")));
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
      setFeedback(errorMessage(error, t as never, t("owner.schedule.removeError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("owner.schedule.title")}
        </Text>
        <Text style={styles.note}>{t("owner.schedule.note")}</Text>
        <View style={styles.barberList}>
          {barbers.map((barber) => (
            <Button
              accessibilityState={{ selected: barber.id === selectedBarberId }}
              color={barber.id === selectedBarberId ? "#2563eb" : undefined}
              key={barber.id}
              onPress={() => setSelectedBarberId(barber.id)}
              title={barber.id === selectedBarberId ? t("common.selectedOption", { option: barber.name }) : barber.name}
            />
          ))}
        </View>
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        {!selectedBarber ? <Text style={styles.note}>{t("owner.schedule.noBarber")}</Text> : null}
        {selectedBarber ? (
          <>
            <Text style={styles.note}>{t("owner.schedule.selectedBarber", { name: selectedBarber.name })}</Text>
            <Text style={styles.sectionTitle}>{t("owner.schedule.periodsTitle", { name: selectedBarber.name })}</Text>
            <TextInput
              keyboardType="numeric"
              onChangeText={setWeekday}
              placeholder={t("owner.schedule.weekdayLabel")}
              style={styles.input}
              value={weekday}
            />
            <TextInput
              onChangeText={setStartTime}
              placeholder={t("common.startTime")}
              style={styles.input}
              value={startTime}
            />
            <TextInput
              onChangeText={setEndTime}
              placeholder={t("common.endTime")}
              style={styles.input}
              value={endTime}
            />
            <Button disabled={isSaving} onPress={handleAddPeriod} title={t("owner.schedule.addPeriod")} />
            {selectedPeriods.map((period) => (
              <View key={period.id} style={styles.card}>
                <Text>
                  {t("owner.schedule.periodLine", {
                    end: period.endTime,
                    start: period.startTime,
                    weekday: t(`owner.schedule.weekdays.${WEEKDAY_KEYS[period.weekday - 1]}`),
                  })}
                </Text>
                <Button
                  disabled={isSaving}
                  onPress={() => void handleDelete(() => deleteWorkingPeriod(supabase, period.id))}
                  title={t("common.remove")}
                />
              </View>
            ))}

            <Text style={styles.sectionTitle}>{t("owner.schedule.overridesTitle")}</Text>
            <TextInput
              onChangeText={setLocalDate}
              placeholder={t("common.localDate")}
              style={styles.input}
              value={localDate}
            />
            <View style={styles.barberList}>
              <Button
                accessibilityState={{ selected: overrideKind === "block" }}
                color={overrideKind === "block" ? "#2563eb" : undefined}
                onPress={() => setOverrideKind("block")}
                title={overrideKind === "block" ? t("common.selectedOption", { option: t("owner.schedule.blockTime") }) : t("owner.schedule.blockTime")}
              />
              <Button
                accessibilityState={{ selected: overrideKind === "opening" }}
                color={overrideKind === "opening" ? "#2563eb" : undefined}
                onPress={() => setOverrideKind("opening")}
                title={overrideKind === "opening" ? t("common.selectedOption", { option: t("owner.schedule.extraOpening") }) : t("owner.schedule.extraOpening")}
              />
            </View>
            {overrideKind === "block" ? (
              <View style={styles.barberList}>
                <Button
                  accessibilityState={{ selected: isAllDayBlock }}
                  color={isAllDayBlock ? "#2563eb" : undefined}
                  onPress={() => setIsAllDayBlock(true)}
                  title={isAllDayBlock ? t("common.selectedOption", { option: t("owner.schedule.allDayOption") }) : t("owner.schedule.allDayOption")}
                />
                <Button
                  accessibilityState={{ selected: !isAllDayBlock }}
                  color={!isAllDayBlock ? "#2563eb" : undefined}
                  onPress={() => setIsAllDayBlock(false)}
                  title={!isAllDayBlock ? t("common.selectedOption", { option: t("owner.schedule.timedBlock") }) : t("owner.schedule.timedBlock")}
                />
              </View>
            ) : null}
            {showOverrideTimes ? (
              <>
                <TextInput
                  onChangeText={setOverrideStartTime}
                  placeholder={t("common.startTime")}
                  style={styles.input}
                  value={overrideStartTime}
                />
                <TextInput
                  onChangeText={setOverrideEndTime}
                  placeholder={t("common.endTime")}
                  style={styles.input}
                  value={overrideEndTime}
                />
              </>
            ) : null}
            <Button disabled={isSaving} onPress={handleAddOverride} title={t("owner.schedule.addOverride")} />
            {selectedOverrides.map((override) => (
              <View key={override.id} style={styles.card}>
                <Text>
                  {t("owner.schedule.overrideLine", {
                    date: override.localDate,
                    kind: override.kind === "opening" ? t("owner.schedule.kindOpening") : t("owner.schedule.kindBlock"),
                    time: override.startTime ? `${override.startTime}–${override.endTime}` : t("common.allDay"),
                  })}
                </Text>
                <Button
                  disabled={isSaving}
                  onPress={() => void handleDelete(() => deleteScheduleOverride(supabase, override.id))}
                  title={t("common.remove")}
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
