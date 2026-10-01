import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Screen } from "../../src/components/ui/Screen";
import { listPublicShops, listShopHours, saveShopHours, updateShopContact } from "../../src/features/shops/api";
import { draftToPeriods, periodsToDraft, weekdayLabel } from "../../src/features/shops/hours";
import type { DayDraft, ShopPeriod } from "../../src/features/shops/hours";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
// A format hint, not a sentence: the same in every language.
const TIME_HINT = "HH:mm";

export default function OwnerShopScreen() {
  const { t } = useTranslation();
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
  const [feedback, setFeedback] = useState<string | null>(null);

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
        setFeedback(`${weekdayLabel(weekday, language)}: ${t(`owner.shop.errors.${result.error}`)}`);
        return;
      }
      periods.push(...result.periods.map((period) => ({ ...period, weekday })));
    }
    try {
      await saveShopHours(supabase, periods);
      if (shop) await updateShopContact(supabase, shop.id, contact);
      await queryClient.invalidateQueries({ queryKey: ["public-shops"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-hours"] });
      setFeedback(t("owner.shop.saved"));
    } catch (error) {
      setFeedback(errorMessage(error, t, t("owner.shop.saveError")));
    }
  };

  const field = (key: keyof typeof contact, label: string) => (
    <View style={styles.field}>
      <Text>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        onChangeText={(value) => setContact((current) => ({ ...current, [key]: value }))}
        style={styles.input}
        value={contact[key]}
      />
    </View>
  );
  const time = (label: string, value: string, onChange: (value: string) => void) => (
    <TextInput accessibilityLabel={label} onChangeText={onChange} placeholder={TIME_HINT} style={[styles.input, styles.time]} value={value} />
  );

  return (
    <Screen style={styles.screen}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{t("owner.shop.title")}</Text>
        {field("address", t("owner.shop.address"))}
        {field("phone", t("owner.shop.phone"))}
        {field("whatsapp", t("owner.shop.whatsapp"))}
        {WEEKDAYS.map((weekday) => {
          const day = days[weekday];
          if (!day) return null;
          const name = weekdayLabel(weekday, language);

          return (
            <View key={weekday} style={styles.day} testID={`shop-day-${weekday}`}>
              <View style={styles.row}>
                <Text style={styles.dayName}>{name}</Text>
                <Switch accessibilityLabel={`${name} ${t("owner.shop.open")}`} onValueChange={(enabled) => patchDay(weekday, { enabled })} value={day.enabled} />
                {!day.enabled ? <Text>{t("owner.shop.closed")}</Text> : null}
              </View>
              {day.enabled ? (
                <>
                  <View style={styles.row}>
                    {time(t("common.startTime"), day.start, (start) => patchDay(weekday, { start }))}
                    {time(t("common.endTime"), day.end, (end) => patchDay(weekday, { end }))}
                  </View>
                  {day.breaks.map((pause, index) => (
                    <View key={index} style={styles.row}>
                      {time(t("owner.shop.breakStart"), pause.start, (start) =>
                        patchDay(weekday, { breaks: day.breaks.map((item, i) => (i === index ? { ...item, start } : item)) }))}
                      {time(t("owner.shop.breakEnd"), pause.end, (end) =>
                        patchDay(weekday, { breaks: day.breaks.map((item, i) => (i === index ? { ...item, end } : item)) }))}
                      <Button onPress={() => patchDay(weekday, { breaks: day.breaks.filter((_, i) => i !== index) })} title={t("owner.shop.removeBreak")} />
                    </View>
                  ))}
                  <Button onPress={() => patchDay(weekday, { breaks: [...day.breaks, { end: "13:00", start: "12:00" }] })} title={t("owner.shop.addBreak")} />
                </>
              ) : null}
            </View>
          );
        })}
        {feedback ? <Text>{feedback}</Text> : null}
        <Button onPress={() => void save()} title={t("owner.shop.save")} />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, maxWidth: 520, width: "100%" },
  day: { borderColor: "#e5e7eb", borderRadius: 8, borderWidth: 1, gap: 8, padding: 12 },
  dayName: { fontWeight: "600", minWidth: 48 },
  field: { gap: 4 },
  input: { borderColor: "#d1d5db", borderRadius: 6, borderWidth: 1, padding: 8 },
  row: { alignItems: "center", flexDirection: "row", gap: 8 },
  screen: { alignItems: "center", backgroundColor: "#fff", flex: 1, padding: 24 },
  time: { width: 90 },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
