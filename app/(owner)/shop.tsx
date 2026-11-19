import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps, ComponentRef } from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { CepInput, TimeInput } from "../../src/components/ui/MaskedInputs";
import { Screen } from "../../src/components/ui/Screen";
import { Toggle } from "../../src/components/ui/Toggle";
import { listOwnerProfessionals } from "../../src/features/professionals/api";
import type { OwnerProfessional } from "../../src/features/professionals/types";
import { createScheduleOverride, deleteScheduleOverride, listOwnerScheduleOverrides } from "../../src/features/schedule/api";
import { addressFromColumns, EMPTY_ADDRESS } from "../../src/features/shops/address";
import type { ShopAddress } from "../../src/features/shops/address";
import { lookupCep, mergeCepResult } from "../../src/features/shops/cep";
import { ClosedDatesCard } from "../../src/features/shops/ClosedDatesCard";
import { closedDates, copyDayToOthers } from "../../src/features/shops/day-tools";
import { listShopHours, saveShopHours, updateShopContact } from "../../src/features/shops/api";
import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { draftToPeriods, periodsToDraft, weekdayLabel } from "../../src/features/shops/hours";
import type { DayDraft, ShopPeriod } from "../../src/features/shops/hours";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const CONTACT_EXAMPLE = { phone: "examples.phone", whatsapp: "examples.phone" } as const;

export default function OwnerShopScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  // The owner is always on their own shop's address (ShopGate redirects any other host).
  const { shop } = useCurrentShop();
  const hours = useQuery({
    enabled: Boolean(shop),
    queryFn: () => listShopHours(supabase, shop!.id),
    queryKey: ["shop-hours", shop?.id],
  });
  const [contact, setContact] = useState<{ address: ShopAddress; phone: string; whatsapp: string }>({ address: EMPTY_ADDRESS, phone: "", whatsapp: "" });
  const numberRef = useRef<ComponentRef<typeof TextInput>>(null);
  const latestCep = useRef("");
  const [days, setDays] = useState<Record<number, DayDraft>>({});
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const today = formatInstantInShopTime(new Date()).localDate;
  const closure = useQuery({
    enabled: Boolean(shop),
    queryFn: async () => {
      const [professionals, overrides] = await Promise.all([listOwnerProfessionals(supabase, shop!.id), listOwnerScheduleOverrides(supabase, shop!.id)]);
      const activeProfessionals = (professionals as OwnerProfessional[]).filter((professional) => professional.active);

      return { activeProfessionals, overrides, dates: closedDates(overrides, activeProfessionals.map((professional: OwnerProfessional) => professional.id), today) };
    },
    queryKey: ["owner-schedule", shop?.id, "closures"],
  });
  const refreshClosures = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-schedule"] });
    void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
  };
  const closeShop = useMutation({
    mutationFn: async (date: string) => {
      for (const professional of closure.data?.activeProfessionals ?? []) {
        await createScheduleOverride(supabase, { professionalId: professional.id, endTime: null, kind: "block", localDate: date, shopId: shop!.id, startTime: null });
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
    if (shop) setContact({ address: addressFromColumns(shop), phone: shop.phone ?? "", whatsapp: shop.whatsapp ?? "" });
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
      await queryClient.invalidateQueries({ queryKey: ["current-shop"] });
      await queryClient.invalidateQueries({ queryKey: ["shop-hours"] });
      setFeedback({ message: t("owner.shop.saved"), variant: "success" });
    } catch (error) {
      setFeedback({ message: errorMessage(error, t, t("owner.shop.saveError")), variant: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  const field = (key: "phone" | "whatsapp", label: string) => (
    <Input label={label} onChangeText={(value) => setContact((current) => ({ ...current, [key]: value }))} placeholder={t(CONTACT_EXAMPLE[key])} testID={`shop-${key}`} value={contact[key]} />
  );
  // Editing the city by hand invalidates the IBGE code the lookup filled in.
  const patchAddress = (patch: Partial<ShopAddress>) => setContact((current) => ({ ...current, address: { ...current.address, ...patch, ...("city" in patch ? { cityIbge: "" } : {}) } }));
  const changeCep = (cep: string) => {
    patchAddress({ cep });
    const digits = cep.replace(/\D/g, "");
    latestCep.current = digits;
    if (digits.length !== 8) return;

    void lookupCep(digits).then((result) => {
      if (result.status === "found") {
        // Ignore an answer for a CEP the owner has already changed.
        setContact((current) => (current.address.cep.replace(/\D/g, "") === digits ? { ...current, address: mergeCepResult(current.address, result.address) } : current));
        // Only a still-current answer moves the focus (a late one must not steal it).
        if (latestCep.current === digits) numberRef.current?.focus();
      } else {
        setFeedback({ message: t(result.status === "not-found" ? "owner.shop.cepNotFound" : "owner.shop.cepUnavailable"), variant: "error" });
      }
    });
  };
  const addressField = (key: keyof ShopAddress, label: string, example: string, extra: Partial<ComponentProps<typeof Input>> = {}) => (
    <Input label={label} onChangeText={(value) => patchAddress({ [key]: value })} placeholder={t(example as never)} testID={`shop-${key}`} value={contact.address[key]} {...extra} />
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
                <CepInput label={t("owner.shop.cep")} onChangeValue={changeCep} testID="shop-cep" value={contact.address.cep} />
                {addressField("street", t("owner.shop.street"), "examples.street")}
                {addressField("number", t("owner.shop.number"), "examples.number", { inputRef: numberRef })}
                {addressField("complement", t("owner.shop.complement"), "examples.complement")}
                {addressField("district", t("owner.shop.district"), "examples.district")}
                {addressField("city", t("owner.shop.city"), "examples.city")}
                {addressField("state", t("owner.shop.state"), "examples.state", { autoCapitalize: "characters", maxLength: 2 })}
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
                      <Toggle
                        accessibilityLabel={`${name} ${t("owner.shop.open")}`}
                        onValueChange={(enabled) => patchDay(weekday, { enabled })}
                        testID={`shop-open-${weekday}`}
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
            <ClosedDatesCard busy={closeShop.isPending || reopen.isPending} dates={closure.data?.dates ?? []} disabled={!closure.data} onClose={(date) => closeShop.mutate(date)} onReopen={(date) => reopen.mutate(date)} today={today} />
            <Button disabled={isSaving} label={t("owner.shop.save")} onPress={() => void save()} testID="shop-save" />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
