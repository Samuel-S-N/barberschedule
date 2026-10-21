import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { MonthCalendar } from "../../../../src/components/domain/MonthCalendar";
import { ScreenHeader } from "../../../../src/components/domain/ScreenHeader";
import { StepIndicator } from "../../../../src/components/domain/StepIndicator";
import { Button } from "../../../../src/components/ui/Button";
import { formatInstantInShopTime } from "../../../../src/lib/dates/shop-time";
import { Screen } from "../../../../src/components/ui/Screen";
import { useBack } from "../../../../src/lib/navigation/use-back";
import { useNow } from "../../../../src/lib/use-now";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookDateScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; shopId?: string }>();
  const router = useRouter();
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const shopId = param(params.shopId);
  const { t } = useTranslation();
  const back = useBack("/book");
  const today = formatInstantInShopTime(useNow()).localDate;
  const [picked, setLocalDate] = useState(today);
  const localDate = picked < today ? today : picked;

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-6 p-5">
        <View className="w-full max-w-[420px]">
          <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("book.dateTitle")} />
        </View>
        <StepIndicator current="date" ids={{ barberId, barberServiceId, shopId }} />
        <MonthCalendar onSelectDate={setLocalDate} selectedDate={localDate} today={today} />
        <View className="w-full max-w-[420px]">
          <Button
            label={t("book.continue")}
            onPress={() => router.push(
              `/book/time?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}`,
            )}
          />
        </View>
      </View>
    </Screen>
  );
}
