import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";

import { CalendarStrip } from "../../../src/components/domain/CalendarStrip";
import { Button } from "../../../src/components/ui/Button";
import { buildCalendarStripDays } from "../../../src/lib/dates/calendar-strip-days";

const DAYS_AHEAD = 14;

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookDateScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; shopId?: string }>();
  const router = useRouter();
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const shopId = param(params.shopId);
  const days = useMemo(() => buildCalendarStripDays(new Date(), DAYS_AHEAD), []);
  const [localDate, setLocalDate] = useState(days[0].date);

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-6 p-6">
        <Text accessibilityRole="header" className="w-full max-w-[420px] text-2xl font-display-bold text-ink">
          Choose a date
        </Text>
        <View className="w-full">
          <CalendarStrip days={days} onSelectDate={setLocalDate} selectedDate={localDate} />
        </View>
        <View className="w-full max-w-[420px]">
          <Button
            label="Continue to review"
            onPress={() => router.push(
              `/book/review?shopId=${encodeURIComponent(shopId)}&barberId=${encodeURIComponent(barberId)}&barberServiceId=${encodeURIComponent(barberServiceId)}&localDate=${encodeURIComponent(localDate)}`,
            )}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
