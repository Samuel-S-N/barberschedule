import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { StepIndicator } from "../../../../src/components/domain/StepIndicator";
import { TimeSlotPicker } from "../../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../../src/components/domain/TimeSlotPicker";
import { Button } from "../../../../src/components/ui/Button";
import { Screen } from "../../../../src/components/ui/Screen";
import { getAvailableSlotsQueryOptions } from "../../../../src/features/availability/query";
import type { AvailableSlot } from "../../../../src/features/availability/types";
import { useLanguage } from "../../../../src/i18n/use-language";
import { formatDateNumeric } from "../../../../src/lib/i18n/format";
import { useBack } from "../../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookTimeScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; localDate?: string; shopId?: string }>();
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const localDate = param(params.localDate);
  const shopId = param(params.shopId);
  const router = useRouter();
  const back = useBack();
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId && localDate),
  });
  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({
    status: slot.startsAt === startsAt ? "selected" : "free",
    time: slot.localTime,
  }));

  // After a lost booking race the list is refetched; a time that is no longer offered must not stay selected.
  const selectedStillFree = Boolean(startsAt && availability.data?.some((slot: AvailableSlot) => slot.startsAt === startsAt));

  const selectSlot = (time: string) => {
    setStartsAt(availability.data?.find((slot: AvailableSlot) => slot.localTime === time)?.startsAt ?? null);
  };

  const next = () =>
    router.push(
      `/book/review?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}&startsAt=${encodeURIComponent(startsAt ?? "")}`,
    );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <View className="w-full max-w-[420px]">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("book.timeTitle")} />
          </View>
          <StepIndicator current="time" ids={{ barberId, barberServiceId, localDate, shopId }} />
          <Text className="w-full max-w-[420px] text-base font-sans text-neutral-600">{localDate ? formatDateNumeric(localDate, language) : ""}</Text>
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? (
              <>
                <SkeletonBlock height={56} width={320} />
                <SkeletonBlock height={56} width={320} />
              </>
            ) : null}
            {availability.error ? <Text className="text-sm font-sans text-danger-500">{t("book.timesError")}</Text> : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? <EmptyState title={t("book.noTimes")} /> : null}
            {slots.length > 0 ? <TimeSlotPicker onSelectSlot={selectSlot} slots={slots} /> : null}
          </View>
          <View className="w-full max-w-[420px]">
            <Button disabled={!selectedStillFree} label={t("book.continueToCheckout")} onPress={next} testID="book-time-continue" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
