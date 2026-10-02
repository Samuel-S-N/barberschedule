import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, UserX, XCircle } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Input } from "../../src/components/ui/Input";

import { ChartSection } from "../../src/components/charts/ChartSection";
import { ColumnChart } from "../../src/components/charts/ColumnChart";
import { DonutChart } from "../../src/components/charts/DonutChart";
import { SERVICE_SLICE_COLORS } from "../../src/components/charts/geometry";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StatTile } from "../../src/components/domain/StatTile";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { barberRows, sumShopReport, topByValue } from "../../src/features/owner-reports/build";
import { getShopReport } from "../../src/features/owner-reports/api";
import { ownerReportCsv } from "../../src/features/reports/csv";
import { useCsvLabels } from "../../src/features/reports/use-csv-labels";
import { saveExportFile } from "../../src/features/account/export-file";
import { deleteRentPayment, listRentPayments, parseReaisToCents, recordRentPayment } from "../../src/features/owner-reports/rent";
import { dailySeries, daysBetween, percentChange, previousRange, WEEKLY_THRESHOLD_DAYS } from "../../src/features/reports/build-report";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { colors } from "../../src/lib/design/colors";
import { formatWeekdayShort } from "../../src/lib/i18n/format";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type Period = "month" | "quarter" | "week";

function rangeFor(period: Period, today: string) {
  if (period === "week") return { end: today, start: addLocalDays(today, -6) };
  if (period === "quarter") return { end: today, start: addLocalDays(today, -89) };

  return { end: today, start: `${today.slice(0, 8)}01` };
}

export default function OwnerRevenueScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [period, setPeriod] = useState<Period>("month");
  const today = formatInstantInShopTime(new Date()).localDate;
  const range = useMemo(() => rangeFor(period, today), [period, today]);
  const previous = useMemo(() => previousRange(range.start, range.end), [range]);

  const current = useQuery({ queryFn: () => getShopReport(supabase, range.start, range.end), queryKey: ["owner-report", range.start, range.end] });
  const before = useQuery({ queryFn: () => getShopReport(supabase, previous.start, previous.end), queryKey: ["owner-report", previous.start, previous.end] });

  const queryClient = useQueryClient();
  const payments = useQuery({ queryFn: () => listRentPayments(supabase, range.start, range.end), queryKey: ["rent-payments", range.start, range.end] });
  // Rent payment form: one barber at a time; remove needs a second tap on the same payment.
  const [payingFor, setPayingFor] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const refreshRent = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-report"] });
    void queryClient.invalidateQueries({ queryKey: ["rent-payments"] });
  };
  const savePayment = useMutation({
    mutationFn: (input: { amountCents: number; barberId: string }) => recordRentPayment(supabase, { ...input, note, paidOn }),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.revenue.loadError")), variant: "error" }),
    onSuccess: () => {
      setPayingFor(null);
      setFeedback({ message: t("owner.revenue.paymentSaved"), variant: "success" });
      refreshRent();
    },
  });
  const removePayment = useMutation({
    mutationFn: (id: string) => deleteRentPayment(supabase, id),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.revenue.loadError")), variant: "error" }),
    onSettled: () => setConfirmRemoveId(null),
    onSuccess: () => {
      setFeedback({ message: t("owner.revenue.paymentRemoved"), variant: "success" });
      refreshRent();
    },
  });
  const openPayment = (barberId: string, owedCents: number) => {
    setPayingFor(barberId);
    setAmount((Math.max(owedCents, 0) / 100).toFixed(2).replace(".", ","));
    setPaidOn(today);
    setNote("");
  };
  const submitPayment = (barberId: string) => {
    const cents = parseReaisToCents(amount);

    if (cents === null) return setFeedback({ message: t("owner.revenue.invalidAmount"), variant: "error" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setFeedback({ message: t("owner.revenue.invalidDate"), variant: "error" });
    savePayment.mutate({ amountCents: cents, barberId });
  };

  const csvLabels = useCsvLabels();
  const report = current.data;
  const exportCsv = async () => {
    if (!report) return;
    try {
      await saveExportFile({ content: ownerReportCsv(report, csvLabels), filename: `revenue-${range.start}_${range.end}.csv`, mimeType: "text/csv;charset=utf-8" });
    } catch {
      setFeedback({ message: t("csv.exportError"), variant: "error" });
    }
  };
  const totals = report ? sumShopReport(report) : null;
  const previousTotals = before.data ? sumShopReport(before.data) : null;
  const money = (cents: number) => formatPriceBRL(cents);
  const delta = (now: number, was: number | undefined) => {
    const change = was === undefined ? null : percentChange(now, was);

    return change === null ? t("barber.reports.noPrevious") : `${change > 0 ? "+" : ""}${change}% ${t("barber.reports.vsPrevious")}`;
  };
  // Per-barber and per-service change against the previous period (null when there is nothing to compare).
  const barberDelta = (barberId: string, now: number) => {
    const was = before.data?.barbers.find((b) => b.barberId === barberId)?.grossCents;

    return delta(now, was);
  };
  const shortDelta = (now: number, was: number | undefined) => {
    const change = was === undefined ? null : percentChange(now, was);

    return change === null ? "" : ` · ${change > 0 ? "+" : ""}${change}%`;
  };
  const hasActivity = totals ? totals.completed + totals.cancelled + totals.noShow > 0 || (report?.days.some((d) => d.upcoming > 0) ?? false) : false;

  const grouped = daysBetween(range.start, range.end) > WEEKLY_THRESHOLD_DAYS;
  const series = report ? dailySeries(report.days, range.start, range.end, (d) => d.grossCents) : [];
  const revenueData = series.map((p) => ({
    key: p.key,
    label: grouped ? `${p.from.slice(8)}/${p.from.slice(5, 7)}` : series.length <= 8 ? formatWeekdayShort(p.from, language) : p.from.slice(8),
    value: p.value,
  }));
  const rows = report ? barberRows(report) : [];
  const donutColor = (key: string, index: number) => (key === "other" ? colors.neutral[500] : SERVICE_SLICE_COLORS[index % SERVICE_SLICE_COLORS.length]);
  const barberItems = report ? topByValue(report.barbers.map((b) => ({ key: b.barberId, name: b.name, value: b.grossCents }))) : [];
  const serviceItems = report ? topByValue(report.services.map((s) => ({ key: s.serviceId, name: s.name, value: s.grossCents }))) : [];
  const label = (item: { key: string; name: string }) => (item.key === "other" ? t("barber.reports.other") : item.name);

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("owner.revenue.title")}</Text>
          <View className="w-full max-w-[420px] flex-row flex-wrap gap-2">
            {(["week", "month", "quarter"] as const).map((key) => (
              <Button
                key={key}
                label={t(`barber.reports.period${key === "week" ? "Week" : key === "month" ? "Month" : "Quarter"}`)}
                onPress={() => setPeriod(key)}
                size="sm"
                testID={`revenue-period-${key}`}
                variant={period === key ? "dark" : "outline"}
              />
            ))}
          </View>

          <View className="w-full max-w-[420px] gap-3">
            {report ? <Button label={t("csv.export")} onPress={() => void exportCsv()} size="sm" testID="report-export" variant="outline" /> : null}
            {current.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {current.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(current.error, t, t("owner.revenue.loadError"))}</Text> : null}
            {report && totals ? (
              <>
                <View className="flex-row flex-wrap gap-3">
                  <StatTile label={t("owner.revenue.revenue")} sublabel={delta(totals.grossCents, previousTotals?.grossCents)} testID="stat-revenue" value={money(totals.grossCents)} />
                  <StatTile label={t("owner.revenue.shopIncome")} sublabel={t("owner.revenue.shopIncomeHint")} testID="stat-shop-income" value={money(totals.shopIncomeCents)} />
                  <StatTile label={t("barber.reports.completed")} sublabel={delta(totals.completed, previousTotals?.completed)} testID="stat-completed" value={String(totals.completed)} />
                  <StatTile
                    label={t("barber.reports.cancellationRate")}
                    sublabel={t("barber.reports.cancellationHint", { count: totals.cancelled + totals.noShow })}
                    testID="stat-cancellation"
                    value={totals.cancellationRate === null ? "—" : `${Math.round(totals.cancellationRate * 100)}%`}
                  />
                </View>

                {!hasActivity ? <EmptyState title={t("barber.reports.empty")} /> : null}
                {hasActivity ? (
                  <>
                    <ChartSection rows={revenueData.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: money(d.value) }))} testID="section-revenue" title={t(grouped ? "owner.revenue.byWeek" : "owner.revenue.byDay")}>
                      <ColumnChart accessibilityLabel={t("owner.revenue.revenue")} data={revenueData} formatTick={(v) => (v === 0 ? "0" : String(Math.round(v / 100)))} formatValue={money} testID="chart-revenue" />
                    </ChartSection>

                    {barberItems.length > 0 ? (
                      <ChartSection rows={barberItems.map((i) => ({ label: label(i), value: `${money(i.value)}${i.key === "other" ? "" : shortDelta(i.value, before.data?.barbers.find((x) => x.barberId === i.key)?.grossCents)}` }))} testID="section-barbers" title={t("owner.revenue.byBarber")}>
                        <DonutChart
                          centerLabel={t("owner.revenue.revenue")}
                          centerValue={money(totals.grossCents)}
                          formatValue={money}
                          slices={barberItems.map((i, index) => ({ color: donutColor(i.key, index), key: i.key, label: label(i), value: i.value }))}
                          testID="donut-barbers"
                        />
                      </ChartSection>
                    ) : null}

                    {serviceItems.length > 0 ? (
                      <ChartSection rows={serviceItems.map((i) => ({ label: label(i), value: `${money(i.value)}${i.key === "other" ? "" : shortDelta(i.value, before.data?.services.find((x) => x.serviceId === i.key)?.grossCents)}` }))} testID="section-services" title={t("owner.revenue.byService")}>
                        <DonutChart
                          centerLabel={t("owner.revenue.revenue")}
                          centerValue={money(totals.grossCents)}
                          formatValue={money}
                          slices={serviceItems.map((i, index) => ({ color: donutColor(i.key, index), key: i.key, label: label(i), value: i.value }))}
                          testID="donut-services"
                        />
                      </ChartSection>
                    ) : null}

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
                  </>
                ) : null}

                <Text accessibilityRole="header" className="pt-2 text-lg font-display-semibold text-ink">{t("owner.revenue.barbersTable")}</Text>
                {rows.map((row) => (
                  <Card key={row.barberId} testID={`barber-row-${row.barberId}`} variant="outlined">
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-base font-sans-semibold text-ink">{row.name}</Text>
                        <Text className="text-xs font-sans text-neutral-500">{t("owner.revenue.colCompleted")}: {row.completed}</Text>
                      </View>
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.colRevenue")}</Text>
                        <Text className="text-sm font-sans-medium text-ink">{money(row.grossCents)}</Text>
                      </View>
                      <Text className="text-right text-xs font-sans text-neutral-500" testID={`barber-delta-${row.barberId}`}>{barberDelta(row.barberId, row.grossCents)}</Text>
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.colBarberShare")}</Text>
                        <Text className="text-sm font-sans-medium text-ink">{money(row.barberShareCents)}</Text>
                      </View>
                      {row.rentEstimateCents > 0 ? (
                        <View className="flex-row justify-between">
                          <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.rentEstimate")}</Text>
                          <Text className="text-sm font-sans-medium text-ink">{money(row.rentEstimateCents)}</Text>
                        </View>
                      ) : null}
                      {row.compensationType === "chair_rental" ? (
                        <View className="flex-row justify-between">
                          <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.rentPaid")}</Text>
                          <Text className="text-sm font-sans-medium text-ink">{money(row.rentPaidCents)}</Text>
                        </View>
                      ) : null}
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-sans-semibold text-ink">{t("owner.revenue.colShopShare")}</Text>
                        <Text className="text-sm font-sans-semibold text-ink">{money(row.shopShareCents)}</Text>
                      </View>
                      {row.compensationType === "chair_rental" && payingFor !== row.barberId ? (
                        <Button label={t("owner.revenue.recordPayment")} onPress={() => openPayment(row.barberId, row.rentEstimateCents - row.rentPaidCents)} size="sm" testID={`rent-pay-${row.barberId}`} variant="outline" />
                      ) : null}
                      {payingFor === row.barberId ? (
                        <View className="gap-2">
                          <Input label={t("owner.revenue.paymentAmount")} onChangeText={setAmount} testID="rent-amount" value={amount} />
                          <Input label={t("owner.revenue.paymentDate")} onChangeText={setPaidOn} testID="rent-date" value={paidOn} />
                          <Input label={t("owner.revenue.paymentNote")} onChangeText={setNote} testID="rent-note" value={note} />
                          <View className="flex-row gap-2">
                            <Button disabled={savePayment.isPending} label={t("owner.revenue.savePayment")} onPress={() => submitPayment(row.barberId)} size="sm" testID="rent-pay-save" />
                            <Button label={t("owner.revenue.cancelPayment")} onPress={() => setPayingFor(null)} size="sm" variant="outline" />
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </Card>
                ))}
                {totals.rentEstimateCents > 0 ? <Text className="text-xs font-sans text-neutral-500">{t("owner.revenue.rentNote")}</Text> : null}
                {totals.rentEstimateCents > 0 || (payments.data?.length ?? 0) > 0 ? (
                  <View className="gap-2" testID="rent-payments">
                    <Text accessibilityRole="header" className="pt-2 text-lg font-display-semibold text-ink">{t("owner.revenue.paymentsTitle")}</Text>
                    {payments.data?.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("owner.revenue.noPayments")}</Text> : null}
                    {(payments.data ?? []).map((payment) => (
                      <Card key={payment.id} testID={`rent-payment-${payment.id}`} variant="outlined">
                        <View className="flex-row items-center justify-between gap-2">
                          <View className="flex-1 gap-0.5">
                            <Text className="text-base font-sans-semibold text-ink">{payment.barberName}</Text>
                            <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                              {payment.paidOn} · {money(payment.amountCents)}
                            </Text>
                            {payment.note ? <Text className="text-xs font-sans text-neutral-500">{payment.note}</Text> : null}
                          </View>
                          <Button
                            disabled={removePayment.isPending}
                            label={confirmRemoveId === payment.id ? t("owner.revenue.removeConfirm") : t("owner.revenue.removePayment")}
                            onPress={() => (confirmRemoveId === payment.id ? removePayment.mutate(payment.id) : setConfirmRemoveId(payment.id))}
                            size="sm"
                            testID={`rent-remove-${payment.id}`}
                            variant="danger"
                          />
                        </View>
                      </Card>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
        <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
      </ScrollView>
    </Screen>
  );
}
