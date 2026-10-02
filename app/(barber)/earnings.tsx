import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, UserX, XCircle } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ChartSection } from "../../src/components/charts/ChartSection";
import { ColumnChart } from "../../src/components/charts/ColumnChart";
import { DonutChart } from "../../src/components/charts/DonutChart";
import { SERVICE_SLICE_COLORS } from "../../src/components/charts/geometry";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StatTile } from "../../src/components/domain/StatTile";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { getMyBarberProfile } from "../../src/features/barbers/api";
import { dailySeries, percentChange, previousRange, sumDays, topServices, weekdayCounts, WEEKLY_THRESHOLD_DAYS, daysBetween } from "../../src/features/reports/build-report";
import { getMyBarberReport } from "../../src/features/reports/api";
import { barberReportCsv } from "../../src/features/reports/csv";
import { useCsvLabels } from "../../src/features/reports/use-csv-labels";
import { saveExportFile } from "../../src/features/account/export-file";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { colors } from "../../src/lib/design/colors";
import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatWeekdayShort } from "../../src/lib/i18n/format";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

type Period = "month" | "quarter" | "week";

function rangeFor(period: Period, today: string) {
  if (period === "week") return { end: today, start: addLocalDays(today, -6) };
  if (period === "quarter") return { end: today, start: addLocalDays(today, -89) };

  return { end: today, start: `${today.slice(0, 8)}01` };
}

const WEEKDAY_REFERENCE = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-06", "2024-01-07"]; // Monday to Sunday

export default function BarberReportsScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const language = useLanguage();
  const { profile, supabase } = useSupabaseSession();
  const [period, setPeriod] = useState<Period>("month");
  const today = formatInstantInShopTime(new Date()).localDate;
  const range = useMemo(() => rangeFor(period, today), [period, today]);
  const previous = useMemo(() => previousRange(range.start, range.end), [range]);

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const current = useQuery({ queryFn: () => getMyBarberReport(supabase, range.start, range.end), queryKey: ["barber-report", range.start, range.end] });
  const before = useQuery({ queryFn: () => getMyBarberReport(supabase, previous.start, previous.end), queryKey: ["barber-report", previous.start, previous.end] });

  const csvLabels = useCsvLabels();
  const [exportFailed, setExportFailed] = useState(false);
  const report = current.data;
  const exportCsv = async () => {
    if (!report) return;
    setExportFailed(false);
    try {
      await saveExportFile({ content: barberReportCsv(report, csvLabels), filename: `report-${range.start}_${range.end}.csv`, mimeType: "text/csv;charset=utf-8" });
    } catch {
      setExportFailed(true);
    }
  };
  const totals = report ? sumDays(report.days) : null;
  const previousTotals = before.data ? sumDays(before.data.days) : null;
  const delta = (now: number, was: number | undefined) => {
    const change = was === undefined ? null : percentChange(now, was);

    return change === null ? t("barber.reports.noPrevious") : `${change > 0 ? "+" : ""}${change}% ${t("barber.reports.vsPrevious")}`;
  };
  const hasActivity = totals ? totals.completed + totals.cancelled + totals.noShow + totals.upcoming > 0 : false;

  const grouped = daysBetween(range.start, range.end) > WEEKLY_THRESHOLD_DAYS;
  const earningsSeries = report ? dailySeries(report.days, range.start, range.end, (d) => d.earningsCents) : [];
  const earningsData = earningsSeries.map((p) => ({
    key: p.key,
    label: grouped ? `${p.from.slice(8)}/${p.from.slice(5, 7)}` : earningsSeries.length <= 8 ? formatWeekdayShort(p.from, language) : p.from.slice(8),
    value: p.value,
  }));
  const weekdayData = report ? weekdayCounts(report.days).map((value, i) => ({ key: WEEKDAY_REFERENCE[i], label: formatWeekdayShort(WEEKDAY_REFERENCE[i], language), value })) : [];
  const serviceItems = report ? topServices(report.services) : [];
  const money = (cents: number) => formatPriceBRL(cents);

  const compensation = barber.data?.compensation;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("barber.reports.title")}</Text>
          <View className="w-full max-w-[420px] flex-row flex-wrap gap-2">
            {(["week", "month", "quarter"] as const).map((key) => (
              <Button
                key={key}
                label={t(`barber.reports.period${key === "week" ? "Week" : key === "month" ? "Month" : "Quarter"}`)}
                onPress={() => setPeriod(key)}
                size="sm"
                testID={`earnings-period-${key}`}
                variant={period === key ? "dark" : "outline"}
              />
            ))}
          </View>

          <View className="w-full max-w-[420px] gap-3">
            {report ? <Button label={t("csv.export")} onPress={() => void exportCsv()} size="sm" testID="report-export" variant="outline" /> : null}
            {exportFailed ? <Text className="text-sm font-sans text-danger-500">{t("csv.exportError")}</Text> : null}
            {current.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {current.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(current.error, t, t("barber.reports.loadError"))}</Text> : null}
            {report && totals ? (
              <>
                <View className="flex-row flex-wrap gap-3">
                  <StatTile label={t("barber.reports.earned")} sublabel={delta(totals.earningsCents, previousTotals?.earningsCents)} testID="stat-earned" value={money(totals.earningsCents)} />
                  <StatTile label={t("barber.reports.completed")} sublabel={delta(totals.completed, previousTotals?.completed)} testID="stat-completed" value={String(totals.completed)} />
                  <StatTile
                    label={t("barber.reports.cancellationRate")}
                    sublabel={t("barber.reports.cancellationHint", { count: totals.cancelled + totals.noShow })}
                    testID="stat-cancellation"
                    value={totals.cancellationRate === null ? "—" : `${Math.round(totals.cancellationRate * 100)}%`}
                  />
                  {compensation?.type === "chair_rental" ? (
                    <StatTile label={t("barber.reports.rentDue")} sublabel={t(`barber.frequency.${compensation.frequency}`)} testID="stat-rent" value={money(compensation.amountCents)} />
                  ) : null}
                </View>

                {!hasActivity ? <EmptyState title={t("barber.reports.empty")} /> : null}
                {hasActivity ? (
                  <>
                    <ChartSection rows={earningsData.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: money(d.value) }))} testID="section-earnings" title={t(grouped ? "barber.reports.earningsByWeek" : "barber.reports.earningsByDay")}>
                      <ColumnChart accessibilityLabel={t("barber.reports.earned")} data={earningsData} formatTick={(v) => (v === 0 ? "0" : String(Math.round(v / 100)))} formatValue={money} testID="chart-earnings" />
                    </ChartSection>

                    <ChartSection
                      rows={[
                        { label: t("barber.reports.outcomeCompleted"), value: String(totals.completed) },
                        { label: t("barber.reports.outcomeCancelled"), value: String(totals.cancelled) },
                        { label: t("barber.reports.outcomeNoShow"), value: String(totals.noShow) },
                      ]}
                      testID="section-outcome"
                      title={t("barber.reports.byOutcome")}
                    >
                      <DonutChart
                        centerLabel={t("barber.reports.total")}
                        centerValue={String(totals.completed + totals.cancelled + totals.noShow)}
                        slices={[
                          { color: colors.success[500], icon: CheckCircle2, key: "completed", label: t("barber.reports.outcomeCompleted"), value: totals.completed },
                          { color: colors.danger[500], icon: XCircle, key: "cancelled", label: t("barber.reports.outcomeCancelled"), value: totals.cancelled },
                          { color: colors.warning[500], icon: UserX, key: "no_show", label: t("barber.reports.outcomeNoShow"), value: totals.noShow },
                        ]}
                        testID="donut-outcome"
                      />
                    </ChartSection>

                    {serviceItems.length > 0 ? (
                      <ChartSection rows={serviceItems.map((s) => ({ label: s.key === "other" ? t("barber.reports.other") : s.name, value: String(s.value) }))} testID="section-services" title={t("barber.reports.topServices")}>
                        <DonutChart
                          centerLabel={t("barber.reports.completed")}
                          centerValue={String(totals.completed)}
                          slices={serviceItems.map((s, i) => ({
                            color: s.key === "other" ? colors.neutral[500] : SERVICE_SLICE_COLORS[i % SERVICE_SLICE_COLORS.length],
                            key: s.key,
                            label: s.key === "other" ? t("barber.reports.other") : s.name,
                            value: s.value,
                          }))}
                          testID="donut-services"
                        />
                      </ChartSection>
                    ) : null}

                    <ChartSection rows={weekdayData.map((d) => ({ label: d.label, value: String(d.value) }))} testID="section-weekdays" title={t("barber.reports.weekdays")}>
                      <ColumnChart accessibilityLabel={t("barber.reports.weekdays")} color={colors.primary[500]} data={weekdayData} formatValue={(v) => String(v)} mutedColor={colors.primary[200]} testID="chart-weekdays" />
                    </ChartSection>
                  </>
                ) : null}
              </>
            ) : null}
            <Text className="text-xs font-sans text-neutral-500">{t("barber.reports.note")}</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
