import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { listMyWorkingPeriods } from "../../../src/features/barbers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export default function BarberHoursScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const back = useBack();
  const { profile, supabase } = useSupabaseSession();
  const periods = useQuery({ queryFn: () => listMyWorkingPeriods(supabase), queryKey: ["my-working-periods", profile?.userId] });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("barber.hub.menu.hours")} />
            <Text className="text-sm font-sans text-neutral-600" testID="barber-hours-note">{t("barber.hours.note")}</Text>
            {periods.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {periods.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(periods.error, t, t("barber.hours.loadError"))}</Text> : null}
            {periods.data ? (
              <Card variant="outlined">
                <View className="gap-3">
                  {WEEKDAY_KEYS.map((key, index) => {
                    const day = periods.data.filter((period) => period.weekday === index + 1);

                    return (
                      <View className="flex-row items-center justify-between gap-3" key={key} testID={`barber-hours-${key}`}>
                        <Text className="text-base font-sans-medium text-ink">{t(`owner.schedule.weekdays.${key}`)}</Text>
                        <Text className="flex-1 text-right text-base font-sans text-neutral-700" style={{ fontVariant: ["tabular-nums"] }}>
                          {day.length === 0 ? t("barber.hours.closed") : day.map((period) => `${period.startTime}–${period.endTime}`).join(", ")}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
