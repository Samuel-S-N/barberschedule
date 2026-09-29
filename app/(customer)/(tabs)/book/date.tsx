import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { MonthCalendar } from "../../../../src/components/domain/MonthCalendar";
import { Button } from "../../../../src/components/ui/Button";
import { formatInstantInShopTime } from "../../../../src/lib/dates/shop-time";
import { Screen } from "../../../../src/components/ui/Screen";

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
  const today = formatInstantInShopTime(new Date()).localDate;
  const [localDate, setLocalDate] = useState(today);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-6 p-5">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
          {t("book.dateTitle")}
        </Text>
        <MonthCalendar onSelectDate={setLocalDate} selectedDate={localDate} today={today} />
        <View className="w-full max-w-[420px]">
          <Button
            label={t("book.continue")}
            onPress={() => router.push(
              `/book/review?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}`,
            )}
          />
        </View>
      </View>
    </Screen>
  );
}
