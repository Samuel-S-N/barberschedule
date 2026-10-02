import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listPublicShops, listShopHours, saveShopHours, updateShopContact } from "../../src/features/shops/api";
import { draftToPeriods, periodsToDraft, weekdayLabel } from "../../src/features/shops/hours";
import type { DayDraft, ShopPeriod } from "../../src/features/shops/hours";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { colors } from "../../src/lib/design/colors";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
// A format hint, not a sentence: the same in every language.
const TIME_HINT = "HH:mm";

export default function OwnerShopScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const language = useLanguage();
  const router = useRouter();
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
    <Input label={label} onChangeText={(value) => setContact((current) => ({ ...current, [key]: value }))} testID={`shop-${key}`} value={contact[key]} />
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

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
                        <View className="flex-row gap-2">
                          <View className="flex-1"><Input label={t("common.startTime")} onChangeText={(start) => patchDay(weekday, { start })} placeholder={TIME_HINT} testID={`shop-start-${weekday}`} value={day.start} /></View>
                          <View className="flex-1"><Input label={t("common.endTime")} onChangeText={(end) => patchDay(weekday, { end })} placeholder={TIME_HINT} testID={`shop-end-${weekday}`} value={day.end} /></View>
                        </View>
                        {day.breaks.map((pause, index) => (
                          <View className="gap-2" key={index}>
                            <View className="flex-row gap-2">
                              <View className="flex-1">
                                <Input
                                  label={t("owner.shop.breakStart")}
                                  onChangeText={(start) => patchDay(weekday, { breaks: day.breaks.map((item, i) => (i === index ? { ...item, start } : item)) })}
                                  placeholder={TIME_HINT}
                                  testID={`shop-break-start-${weekday}-${index}`}
                                  value={pause.start}
                                />
                              </View>
                              <View className="flex-1">
                                <Input
                                  label={t("owner.shop.breakEnd")}
                                  onChangeText={(end) => patchDay(weekday, { breaks: day.breaks.map((item, i) => (i === index ? { ...item, end } : item)) })}
                                  placeholder={TIME_HINT}
                                  testID={`shop-break-end-${weekday}-${index}`}
                                  value={pause.end}
                                />
                              </View>
                            </View>
                            <Button label={t("owner.shop.removeBreak")} onPress={() => patchDay(weekday, { breaks: day.breaks.filter((_, i) => i !== index) })} size="sm" variant="outline" />
                          </View>
                        ))}
                        <Button label={t("owner.shop.addBreak")} onPress={() => patchDay(weekday, { breaks: [...day.breaks, { end: "13:00", start: "12:00" }] })} size="sm" testID={`shop-add-break-${weekday}`} variant="outline" />
                      </>
                    ) : null}
                  </View>
                </Card>
              );
            })}
            <Button disabled={isSaving} label={t("owner.shop.save")} onPress={() => void save()} testID="shop-save" />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
