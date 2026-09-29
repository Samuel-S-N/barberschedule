import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StatTile } from "../../src/components/domain/StatTile";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { getMyBarberProfile } from "../../src/features/barbers/api";
import { getMyBarberEarnings } from "../../src/features/earnings/api";
import { calculateBarberEarnings } from "../../src/features/earnings/calculate";
import { errorMessage } from "../../src/i18n/errors";
import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type Period = "week" | "month";

export default function BarberEarningsScreen() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const [period, setPeriod] = useState<Period>("month");
  const today = formatInstantInShopTime(new Date()).localDate;
  const range = useMemo(
    () => (period === "week" ? { end: today, start: addLocalDays(today, -6) } : { end: today, start: `${today.slice(0, 8)}01` }),
    [period, today],
  );

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const rows = useQuery({
    queryFn: () => getMyBarberEarnings(supabase, range.start, range.end),
    queryKey: ["barber-earnings", range.start, range.end],
  });
  const summary = rows.data && barber.data ? calculateBarberEarnings(rows.data, barber.data.compensation) : null;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {t("barber.earnings.title")}
          </Text>
          <View className="w-full max-w-[420px] flex-row gap-2">
            <Button
              label={t("barber.earnings.periodWeek")}
              onPress={() => setPeriod("week")}
              size="sm"
              testID="earnings-period-week"
              variant={period === "week" ? "dark" : "outline"}
            />
            <Button
              label={t("barber.earnings.periodMonth")}
              onPress={() => setPeriod("month")}
              size="sm"
              testID="earnings-period-month"
              variant={period === "month" ? "dark" : "outline"}
            />
          </View>
          <View className="w-full max-w-[420px] gap-3">
            {rows.isLoading || barber.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {rows.error ? (
              <Text className="text-sm font-sans text-danger-500">{errorMessage(rows.error, t as never, t("barber.earnings.loadError"))}</Text>
            ) : null}
            {summary ? (
              <>
                <View className="flex-row flex-wrap gap-3">
                  <StatTile label={t("barber.earnings.completed")} testID="stat-completed" value={String(summary.completedCount)} />
                  <StatTile label={t("barber.earnings.gross")} testID="stat-gross" value={formatPriceBRL(summary.grossCents)} />
                  <StatTile label={t("barber.earnings.earned")} testID="stat-earned" value={formatPriceBRL(summary.earningsCents)} />
                  {summary.rentalDue ? (
                    <StatTile
                      label={t("barber.earnings.rentDue")}
                      sublabel={t(`barber.frequency.${summary.rentalDue.frequency}`)}
                      testID="stat-rent"
                      value={formatPriceBRL(summary.rentalDue.amountCents)}
                    />
                  ) : null}
                </View>
                {rows.data?.length === 0 ? <EmptyState title={t("barber.earnings.empty")} /> : null}
                {rows.data && rows.data.length > 0 ? (
                  <View className="gap-2">
                    <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">
                      {t("barber.earnings.breakdown")}
                    </Text>
                    {rows.data.map((row) => (
                      <Card key={row.serviceId} variant="outlined">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-base font-sans-medium text-ink">
                            {t("barber.earnings.serviceLine", { count: row.completedCount, name: row.serviceName })}
                          </Text>
                          <Text className="text-base font-sans-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                            {formatPriceBRL(row.grossCents)}
                          </Text>
                        </View>
                      </Card>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            <Text className="text-xs font-sans text-neutral-500">{t("barber.earnings.note")}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
