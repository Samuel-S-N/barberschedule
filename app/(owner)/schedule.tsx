import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import {
  createScheduleOverride,
  createWorkingPeriod,
  deleteScheduleOverride,
  deleteWorkingPeriod,
  listOwnerScheduleOverrides,
  listOwnerWorkingPeriods,
} from "../../src/features/schedule/api";
import type { ScheduleOverrideKind } from "../../src/features/schedule/types";
import { assertNoOverlappingWorkingPeriod, parseWorkingPeriodInput } from "../../src/features/schedule/validation";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export default function OwnerScheduleScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [localDate, setLocalDate] = useState(formatInstantInShopTime(new Date()).localDate);
  const [overrideKind, setOverrideKind] = useState<ScheduleOverrideKind>("block");
  const [isAllDayBlock, setIsAllDayBlock] = useState(true);
  const [overrideStartTime, setOverrideStartTime] = useState("16:00");
  const [overrideEndTime, setOverrideEndTime] = useState("18:00");

  const data = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const id = shopId ?? "";
      const [barbers, periods, overrides] = await Promise.all([listOwnerBarbers(supabase, id), listOwnerWorkingPeriods(supabase, id), listOwnerScheduleOverrides(supabase, id)]);

      return { barbers, overrides, periods };
    },
    queryKey: ["owner-schedule", shopId],
  });
  const barbers = data.data?.barbers ?? [];

  useEffect(() => {
    if (selectedBarberId === null && barbers.length > 0) setSelectedBarberId(barbers[0].id);
  }, [barbers, selectedBarberId]);

  const selectedBarber = barbers.find((barber: OwnerBarber) => barber.id === selectedBarberId);
  const selectedPeriods = (data.data?.periods ?? []).filter((period) => period.barberId === selectedBarberId);
  const selectedOverrides = (data.data?.overrides ?? []).filter((override) => override.barberId === selectedBarberId);
  const showOverrideTimes = overrideKind === "opening" || !isAllDayBlock;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-schedule"] });
  const fail = (error: unknown, fallback: string) => setFeedback(errorMessage(error, t, fallback));

  const addPeriod = useMutation({
    mutationFn: () => {
      const input = parseWorkingPeriodInput({ barberId: selectedBarberId ?? "", endTime, shopId: shopId ?? "", startTime, weekday });
      assertNoOverlappingWorkingPeriod(input, selectedPeriods);

      return createWorkingPeriod(supabase, input);
    },
    onError: (error) => fail(error, t("owner.schedule.addPeriodError")),
    onSuccess: () => void refresh(),
  });

  const addOverride = useMutation({
    mutationFn: () =>
      createScheduleOverride(supabase, {
        barberId: selectedBarberId ?? "",
        endTime: showOverrideTimes ? overrideEndTime : null,
        kind: overrideKind,
        localDate,
        shopId: shopId ?? "",
        startTime: showOverrideTimes ? overrideStartTime : null,
      }),
    onError: (error) => fail(error, t("owner.schedule.addOverrideError")),
    onSuccess: () => void refresh(),
  });

  const remove = useMutation({
    mutationFn: (job: () => Promise<void>) => job(),
    onError: (error) => fail(error, t("owner.schedule.removeError")),
    onSuccess: () => void refresh(),
  });

  const busy = addPeriod.isPending || addOverride.isPending || remove.isPending;
  const loading = shop.isLoading || data.isLoading;
  const loadError = shop.error ?? data.error;
  const selectable = (label: string, selected: boolean) => (selected ? t("common.selectedOption", { option: label }) : label);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.schedule.title")} />
            <Text className="text-sm font-sans text-neutral-600">{t("owner.schedule.note")}</Text>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.schedule.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            <View className="flex-row flex-wrap gap-2">
              {barbers.map((barber: OwnerBarber) => (
                <Button key={barber.id} label={selectable(barber.name, barber.id === selectedBarberId)} onPress={() => setSelectedBarberId(barber.id)} size="sm" testID={`schedule-barber-${barber.id}`} variant={barber.id === selectedBarberId ? "dark" : "outline"} />
              ))}
            </View>
            {data.data && !selectedBarber ? <Text className="text-sm font-sans text-neutral-600">{t("owner.schedule.noBarber")}</Text> : null}

            {selectedBarber ? (
              <>
                <Text className="text-sm font-sans text-neutral-600">{t("owner.schedule.selectedBarber", { name: selectedBarber.name })}</Text>

                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("owner.schedule.periodsTitle", { name: selectedBarber.name })}</Text>
                <Card>
                  <View className="gap-3">
                    <Text className="text-sm font-sans-medium text-ink">{t("owner.schedule.weekdayLabel")}</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {WEEKDAY_KEYS.map((key, index) => (
                        <Button key={key} label={t(`owner.schedule.weekdays.${key}`)} onPress={() => setWeekday(index + 1)} size="sm" testID={`weekday-${index + 1}`} variant={weekday === index + 1 ? "dark" : "outline"} />
                      ))}
                    </View>
                    <Input label={t("common.startTime")} onChangeText={setStartTime} testID="period-start" value={startTime} />
                    <Input label={t("common.endTime")} onChangeText={setEndTime} testID="period-end" value={endTime} />
                    <Button disabled={busy} label={t("owner.schedule.addPeriod")} onPress={() => addPeriod.mutate()} testID="period-add" />
                  </View>
                </Card>
                {selectedPeriods.map((period) => (
                  <Card key={period.id} testID={`period-${period.id}`} variant="outlined">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                        {t("owner.schedule.periodLine", { end: period.endTime, start: period.startTime, weekday: t(`owner.schedule.weekdays.${WEEKDAY_KEYS[period.weekday - 1]}`) })}
                      </Text>
                      <Button disabled={busy} label={t("common.remove")} onPress={() => remove.mutate(() => deleteWorkingPeriod(supabase, period.id))} size="sm" testID={`period-remove-${period.id}`} variant="danger" />
                    </View>
                  </Card>
                ))}

                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("owner.schedule.overridesTitle")}</Text>
                <Card>
                  <View className="gap-3">
                    <Input label={t("common.localDate")} onChangeText={setLocalDate} testID="override-date" value={localDate} />
                    <View className="flex-row flex-wrap gap-2">
                      <Button label={selectable(t("owner.schedule.blockTime"), overrideKind === "block")} onPress={() => setOverrideKind("block")} size="sm" testID="override-kind-block" variant={overrideKind === "block" ? "dark" : "outline"} />
                      <Button label={selectable(t("owner.schedule.extraOpening"), overrideKind === "opening")} onPress={() => setOverrideKind("opening")} size="sm" testID="override-kind-opening" variant={overrideKind === "opening" ? "dark" : "outline"} />
                    </View>
                    {overrideKind === "block" ? (
                      <View className="flex-row flex-wrap gap-2">
                        <Button label={selectable(t("owner.schedule.allDayOption"), isAllDayBlock)} onPress={() => setIsAllDayBlock(true)} size="sm" testID="override-allday" variant={isAllDayBlock ? "dark" : "outline"} />
                        <Button label={selectable(t("owner.schedule.timedBlock"), !isAllDayBlock)} onPress={() => setIsAllDayBlock(false)} size="sm" testID="override-timed" variant={!isAllDayBlock ? "dark" : "outline"} />
                      </View>
                    ) : null}
                    {showOverrideTimes ? (
                      <>
                        <Input label={t("common.startTime")} onChangeText={setOverrideStartTime} testID="override-start" value={overrideStartTime} />
                        <Input label={t("common.endTime")} onChangeText={setOverrideEndTime} testID="override-end" value={overrideEndTime} />
                      </>
                    ) : null}
                    <Button disabled={busy} label={t("owner.schedule.addOverride")} onPress={() => addOverride.mutate()} testID="override-add" />
                  </View>
                </Card>
                {selectedOverrides.map((override) => (
                  <Card key={override.id} testID={`override-${override.id}`} variant="outlined">
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                        {t("owner.schedule.overrideLine", {
                          date: override.localDate,
                          kind: override.kind === "opening" ? t("owner.schedule.kindOpening") : t("owner.schedule.kindBlock"),
                          time: override.startTime ? `${override.startTime}–${override.endTime}` : t("common.allDay"),
                        })}
                      </Text>
                      <Button disabled={busy} label={t("common.remove")} onPress={() => remove.mutate(() => deleteScheduleOverride(supabase, override.id))} size="sm" testID={`override-remove-${override.id}`} variant="danger" />
                    </View>
                  </Card>
                ))}
              </>
            ) : null}
            <Toast message={feedback ?? ""} onDismiss={() => setFeedback(null)} variant="error" visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
