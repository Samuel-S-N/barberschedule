import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { DateInput, TimeInput } from "../../src/components/ui/MaskedInputs";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { createScheduleOverride, deleteScheduleOverride, listOwnerScheduleOverrides } from "../../src/features/schedule/api";
import { closedDates, copyDayToOthers } from "../../src/features/shops/day-tools";
import { listPublicShops, listShopHours, saveShopHours, updateShopContact } from "../../src/features/shops/api";
import { draftToPeriods, periodsToDraft, weekdayLabel } from "../../src/features/shops/hours";
import type { DayDraft, ShopPeriod } from "../../src/features/shops/hours";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { colors } from "../../src/lib/design/colors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const CONTACT_EXAMPLE = { address: "examples.address", phone: "examples.phone", whatsapp: "examples.phone" } as const;

export default function OwnerShopScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shops = useQuery({ queryFn: () => listPublicShops(supabase), queryKey: ["public-shops"] });
  const shop = shops.data?.[0];
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });
  const [contact, setContact] = useState({ address: "", phone: "", whatsapp: "" });
  const [days, setDays] = useState<Record<number, DayDraft>>({});
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const today = formatInstantInShopTime(new Date()).localDate;
  const [closeDate, setCloseDate] = useState(today);
  const closure = useQuery({
    enabled: Boolean(shop),
    queryFn: async () => {
      const [barbers, overrides] = await Promise.all([listOwnerBarbers(supabase, shop!.id), listOwnerScheduleOverrides(supabase, shop!.id)]);
      const activeBarbers = (barbers as OwnerBarber[]).filter((barber) => barber.active);

      return { activeBarbers, overrides, dates: closedDates(overrides, activeBarbers.map((barber: OwnerBarber) => barber.id), today) };
    },
    queryKey: ["owner-schedule", shop?.id, "closures"],
  });
  const refreshClosures = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-schedule"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
  };
  const closeShop = useMutation({
    mutationFn: async () => {
      for (const barber of closure.data?.activeBarbers ?? []) {
        await createScheduleOverride(supabase, { barberId: barber.id, endTime: null, kind: "block", localDate: closeDate, shopId: shop!.id, startTime: null });
      }
    },
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.shop.closedError")), variant: "error" }),
    onSuccess: () => {
      setFeedback({ message: t("owner.shop.closedAdded"), variant: "success" });
      refreshClosures();
    },
  });
  const reopen = useMutation({
    mutationFn: async (date: string) => {
      for (const override of closure.data?.overrides ?? []) {
        if (override.localDate === date && override.kind === "block" && override.startTime === null) await deleteScheduleOverride(supabase, override.id);
      }
    },
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.shop.closedError")), variant: "error" }),
    onSuccess: refreshClosures,
  });

  useEffect(() => {
    if (shop) setContact({ address: shop.address ?? "", phone: shop.phone ?? "", whatsapp: shop.whatsapp ?? "" });
  }, [shop]);
  useEffect(() => {
    if (!hours.data) return;
    setDays(Object.fromEntries(WEEKDAYS.map((day) => [day, periodsToDraft(hours.data.filter((row) => row.weekday === day))])));
  }, [hours.data]);

  const patchDay = (weekday: number, patch: Partial<DayDraft>) =>
    setDays((current) => ({ ...current, [weekday]: { ...current[weekday], ...patch } }));

  const save = async () => {
    // Hours that failed to load must never be saved as "all closed".
    if (WEEKDAYS.some((weekday) => !days[weekday])) return;
    const periods: ShopPeriod[] = [];
    for (const weekday of WEEKDAYS) {
      const result = draftToPeriods(days[weekday]);
      if (!result.ok) {
        setFeedback({ message: `${weekdayLabel(weekday, language)}: ${t(`owner.shop.errors.${result.error}`)}`, variant: "error" });
        return;
      }
      periods.push(...result.periods.map((period) => ({ ...period, weekday })));
    }
    setIsSaving(true);
    try {
      await saveShopHours(supabase, periods);
      if (shop) await updateShopContact(supabase, shop.id, contact);
      await queryClient.invalidateQueries({ queryKey: ["public-shops"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-hours"] });
      setFeedback({ message: t("owner.shop.saved"), variant: "success" });
    } catch (error) {
      setFeedback({ message: errorMessage(error, t, t("owner.shop.saveError")), variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const field = (key: keyof typeof contact, label: string) => (
    <Input label={label} onChangeText={(value) => setContact((current) => ({ ...current, [key]: value }))} placeholder={t(CONTACT_EXAMPLE[key])} testID={`shop-${key}`} value={contact[key]} />
  );
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.shop.title")} />
            <Card>
              <View className="gap-3">
                {field("address", t("owner.shop.address"))}
                {field("phone", t("owner.shop.phone"))}
                {field("whatsapp", t("owner.shop.whatsapp"))}
              </View>
            </Card>
            {WEEKDAYS.map((weekday) => {
              const day = days[weekday];
              if (!day) return null;
              const name = weekdayLabel(weekday, language);

              return (
                <Card key={weekday} testID={`shop-day-${weekday}`} variant="outlined">
                  <View className="gap-3">
                    <View className="flex-row items-center gap-3">
                      <Text className="min-w-[56px] text-base font-sans-semibold text-ink">{name}</Text>
                      <Switch
                        accessibilityLabel={`${name} ${t("owner.shop.open")}`}
                        onValueChange={(enabled) => patchDay(weekday, { enabled })}
                        testID={`shop-open-${weekday}`}
                        thumbColor="#ffffff"
                        trackColor={{ false: colors.neutral[200], true: colors.primary[400] }}
                        value={day.enabled}
                      />
                      <Text className="text-sm font-sans text-neutral-600">{day.enabled ? t("owner.shop.open") : t("owner.shop.closed")}</Text>
                    </View>
                    {day.enabled ? (
                      <>
                        <View className="flex-row items-end gap-2">
                          <View className="flex-1"><TimeInput label={t("common.startTime")} onChangeValue={(start) => patchDay(weekday, { start })} testID={`shop-start-${weekday}`} value={day.start} /></View>
                          <View className="flex-1"><TimeInput label={t("common.endTime")} onChangeValue={(end) => patchDay(weekday, { end })} testID={`shop-end-${weekday}`} value={day.end} /></View>
                        </View>
                        {day.breaks.map((pause, index) => (
                          <View className="gap-2" key={index}>
                            <View className="flex-row items-end gap-2">
                              <View className="flex-1">
                                <TimeInput
                                  label={t("owner.shop.breakStart")}
                                  onChangeValue={(start) => patchDay(weekday, { breaks: day.breaks.map((item, i) => (i === index ? { ...item, start } : item)) })}
                                 
                                  testID={`shop-break-start-${weekday}-${index}`}
                                  value={pause.start}
                                />
                              </View>
                              <View className="flex-1">
                                <TimeInput
                                  label={t("owner.shop.breakEnd")}
                                  onChangeValue={(end) => patchDay(weekday, { breaks: day.breaks.map((item, i) => (i === index ? { ...item, end } : item)) })}
                                 
                                  testID={`shop-break-end-${weekday}-${index}`}
                                  value={pause.end}
                                />
                              </View>
                            </View>
                            <Button label={t("owner.shop.removeBreak")} onPress={() => patchDay(weekday, { breaks: day.breaks.filter((_, i) => i !== index) })} size="sm" variant="outline" />
                          </View>
                        ))}
                        <Button label={t("owner.shop.addBreak")} onPress={() => patchDay(weekday, { breaks: [...day.breaks, { end: "13:00", start: "12:00" }] })} size="sm" testID={`shop-add-break-${weekday}`} variant="outline" />
                        <View className="flex-row flex-wrap gap-2">
                          <Button label={t("owner.shop.copyToAll")} onPress={() => setDays((current) => copyDayToOthers(current, weekday, WEEKDAYS))} size="sm" testID={`shop-copy-all-${weekday}`} variant="ghost" />
                          <Button label={t("owner.shop.copyToWeekdays")} onPress={() => setDays((current) => copyDayToOthers(current, weekday, [1, 2, 3, 4, 5]))} size="sm" testID={`shop-copy-weekdays-${weekday}`} variant="ghost" />
                        </View>
                      </>
                    ) : null}
                  </View>
                </Card>
              );
            })}
            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("owner.shop.closedTitle")}</Text>
            <Card variant="outlined">
              <View className="gap-3">
                {(closure.data?.dates ?? []).length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("owner.shop.closedNone")}</Text> : null}
                {(closure.data?.dates ?? []).map((date) => (
                  <View className="flex-row items-center justify-between gap-2" key={date} testID={`shop-closed-${date}`}>
                    <Text className="text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(date, language)}</Text>
                    <Button disabled={reopen.isPending} label={t("owner.shop.reopen")} onPress={() => reopen.mutate(date)} size="sm" testID={`shop-reopen-${date}`} variant="outline" />
                  </View>
                ))}
                <DateInput label={t("common.localDate")} onChangeValue={setCloseDate} testID="shop-closed-date" value={closeDate} />
                <Button disabled={closeShop.isPending || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate) || closeDate < today || !closure.data} label={t("owner.shop.closedAdd")} onPress={() => closeShop.mutate()} testID="shop-closed-add" variant="outline" />
              </View>
            </Card>
            <Button disabled={isSaving} label={t("owner.shop.save")} onPress={() => void save()} testID="shop-save" />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
