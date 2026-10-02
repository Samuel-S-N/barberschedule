import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StatusBadge } from "../../src/components/domain/StatusBadge";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listOwnerAgenda, listOwnerAgendaOverrides } from "../../src/features/appointments/agenda-query";
import { cancelAppointment } from "../../src/features/appointments/lifecycle";
import { setOwnerAppointmentStatus } from "../../src/features/appointments/owner-api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

type AgendaView = "day" | "week" | "month";

const PAGE_SIZE = 100;

function addDays(localDate: string, days: number) {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function agendaRange(localDate: string, view: AgendaView) {
  if (view === "day") return { end: localDate, start: localDate };
  if (view === "week") return { end: addDays(localDate, 6), start: localDate };
  return { end: addDays(localDate, 30), start: localDate };
}

const VIEW_LABEL = { day: "owner.agenda.viewDay", month: "owner.agenda.viewMonth", week: "owner.agenda.viewWeek" } as const;
const RANGE_LABEL = { day: "owner.agenda.rangeDay", month: "owner.agenda.rangeMonth", week: "owner.agenda.rangeWeek" } as const;

export default function OwnerAgendaScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [localDate, setLocalDate] = useState(formatInstantInShopTime(new Date()).localDate);
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<AgendaView>("day");
  const range = useMemo(() => agendaRange(localDate, view), [localDate, view]);
  const shopId = shop.data ?? null;

  const agenda = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const input = { limit: PAGE_SIZE, offset, rangeEnd: range.end, rangeStart: range.start, shopId: shopId ?? "" };
      const [appointments, overrides] = await Promise.all([listOwnerAgenda(supabase, input), listOwnerAgendaOverrides(supabase, input)]);

      return { appointments, overrides };
    },
    queryKey: ["owner-agenda", shopId, range.start, range.end, offset],
  });

  const update = useMutation({
    mutationFn: (input: { id: string; status: "completed" | "no_show" | "cancelled" }) =>
      input.status === "cancelled" ? cancelAppointment(supabase, input.id) : setOwnerAppointmentStatus(supabase, input.id, input.status),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.agenda.updateError")), variant: "error" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] }),
  });

  const selectView = (nextView: AgendaView) => {
    setOffset(0);
    setView(nextView);
  };

  const moveRange = (direction: -1 | 1) => {
    const days = view === "week" ? 7 : view === "month" ? 31 : 1;
    setOffset(0);
    setLocalDate((date) => addDays(date, direction * days));
  };

  const loading = shop.isLoading || agenda.isLoading;
  const loadError = shop.error ?? agenda.error;
  const appointments = agenda.data?.appointments ?? [];
  const overrides = agenda.data?.overrides ?? [];
  const busy = update.isPending;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("owner.agenda.title")}</Text>
            <Button label={t("owner.agenda.newAppointment")} onPress={() => router.push("/appointment-form")} testID="owner-new-appointment" />

            <View className="flex-row gap-2">
              {(["day", "week", "month"] as const).map((item) => (
                <Button key={item} label={t(VIEW_LABEL[item])} onPress={() => selectView(item)} size="sm" testID={`owner-view-${item}`} variant={view === item ? "dark" : "outline"} />
              ))}
            </View>
            <Input label={t("common.localDate")} onChangeText={(value) => { setLocalDate(value); setOffset(0); }} testID="owner-agenda-date" value={localDate} />
            <Text className="text-center text-sm font-sans text-neutral-600">{t(RANGE_LABEL[view], { date: localDate })}</Text>
            <View className="flex-row gap-2">
              <View className="flex-1"><Button disabled={loading} label={t("owner.agenda.previousRange")} onPress={() => moveRange(-1)} size="sm" variant="outline" /></View>
              <View className="flex-1"><Button disabled={loading} label={t("owner.agenda.nextRange")} onPress={() => moveRange(1)} size="sm" variant="outline" /></View>
            </View>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.agenda.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}
            {agenda.data && appointments.length === 0 && overrides.length === 0 ? <EmptyState title={t("owner.agenda.empty")} /> : null}

            {appointments.map((appointment) => {
              const startsAt = formatInstantInShopTime(new Date(appointment.startsAt));
              const open = appointment.status === "scheduled" || appointment.status === "confirmed";

              return (
                <Card key={appointment.id} testID={`owner-appointment-${appointment.id}`}>
                  <View className="gap-2">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-lg font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{startsAt.localDate} {startsAt.localTime}</Text>
                      <StatusBadge status={appointment.status} />
                    </View>
                    <Text className="text-base font-sans-medium text-ink">{appointment.customerName} · {appointment.serviceNameSnapshot}</Text>
                    <Text className="text-sm font-sans text-neutral-600">{appointment.barberName}</Text>
                    {open ? (
                      <View className="flex-row flex-wrap gap-2">
                        <Button disabled={busy} label={t("owner.agenda.complete")} onPress={() => update.mutate({ id: appointment.id, status: "completed" })} size="sm" testID={`owner-complete-${appointment.id}`} />
                        <Button disabled={busy} label={t("status.no_show")} onPress={() => update.mutate({ id: appointment.id, status: "no_show" })} size="sm" testID={`owner-noshow-${appointment.id}`} variant="outline" />
                        <Button disabled={busy} label={t("common.cancel")} onPress={() => update.mutate({ id: appointment.id, status: "cancelled" })} size="sm" testID={`owner-cancel-${appointment.id}`} variant="danger" />
                      </View>
                    ) : null}
                  </View>
                </Card>
              );
            })}

            {overrides.map((override) => (
              <Card key={override.id} testID={`owner-override-${override.id}`} variant="outlined">
                <View className="gap-1">
                  <Text className="text-base font-sans-semibold text-ink">{override.barberName} · {override.kind === "opening" ? t("owner.schedule.kindOpening") : t("owner.schedule.kindBlock")}</Text>
                  <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                    {override.localDate} · {override.startTime ? `${override.startTime.slice(0, 5)}–${override.endTime?.slice(0, 5)}` : t("common.allDay")}
                  </Text>
                </View>
              </Card>
            ))}

            {offset > 0 || appointments.length >= PAGE_SIZE ? (
              <View className="flex-row justify-between gap-2">
                <Button disabled={offset === 0 || loading} label={t("owner.agenda.previousPage")} onPress={() => setOffset(Math.max(0, offset - PAGE_SIZE))} size="sm" variant="outline" />
                <Button disabled={appointments.length < PAGE_SIZE || loading} label={t("owner.agenda.nextPage")} onPress={() => setOffset(offset + PAGE_SIZE)} size="sm" variant="outline" />
              </View>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
