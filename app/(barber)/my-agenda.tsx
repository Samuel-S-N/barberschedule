import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { CalendarStrip } from "../../src/components/domain/CalendarStrip";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { StatusBadge } from "../../src/components/domain/StatusBadge";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { listMyBarberAgenda, setMyAppointmentStatus, type BarberAgendaAppointment, type BarberAppointmentStatus } from "../../src/features/appointments/barber-agenda";
import { groupByLocalDate, markAppointmentDays, pendingClosure } from "../../src/features/appointments/agenda-view";
import { getMyBarberProfile } from "../../src/features/barbers/api";
import { createScheduleOverride, deleteScheduleOverride, listMyScheduleOverrides } from "../../src/features/schedule/api";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { buildCalendarStripDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const DAYS_AHEAD = 30;
const PENDING_DAYS_BACK = 30;

export default function BarberAgendaScreen() {
  const { t } = useTranslation();
  const field = useFieldChain(2);
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { profile, supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const selectedDate = pickedDate ?? today;

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const rangeEnd = useMemo(() => buildCalendarStripDays(new Date(), DAYS_AHEAD, language).at(-1)?.date ?? today, [language, today]);
  const agenda = useQuery({
    queryFn: () => listMyBarberAgenda(supabase, { limit: 100, offset: 0, rangeEnd, rangeStart: today }),
    queryKey: ["barber-agenda", today, rangeEnd],
  });
  const pendingStart = formatInstantInShopTime(new Date(Date.now() - PENDING_DAYS_BACK * 86_400_000)).localDate;
  const pendingAgenda = useQuery({
    queryFn: () => listMyBarberAgenda(supabase, { limit: 100, offset: 0, rangeEnd: today, rangeStart: pendingStart }),
    queryKey: ["barber-agenda", "pending", pendingStart, today],
  });
  const blocks = useQuery({
    enabled: Boolean(barber.data),
    queryFn: () => listMyScheduleOverrides(supabase, barber.data?.id ?? "", today),
    queryKey: ["barber-blocks", barber.data?.id, today],
  });

  const pending = useMemo(() => pendingClosure(pendingAgenda.data ?? []), [pendingAgenda.data]);
  const grouped = useMemo(() => groupByLocalDate(agenda.data ?? []), [agenda.data]);
  const days = useMemo(() => markAppointmentDays(buildCalendarStripDays(new Date(), DAYS_AHEAD, language), grouped), [grouped, language]);
  const dayAppointments = grouped.get(selectedDate) ?? [];
  const dayBlocks = (blocks.data ?? []).filter((block) => block.localDate === selectedDate && block.kind === "block");

  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BarberAppointmentStatus }) => setMyAppointmentStatus(supabase, input.id, input.status),
    onError: (error) => fail(error, t("barber.agenda.updateError")),
    onSuccess: () => {
      setFeedback({ message: t("barber.agenda.updated"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-earnings"] });
    },
  });

  const addBlock = useMutation({
    mutationFn: () => {
      if (!barber.data) throw new Error("Barber profile not loaded.");
      const timed = blockStart.trim() !== "" || blockEnd.trim() !== "";

      return createScheduleOverride(supabase, {
        barberId: barber.data.id,
        endTime: timed ? blockEnd.trim() : null,
        kind: "block",
        localDate: selectedDate,
        shopId: barber.data.shopId,
        startTime: timed ? blockStart.trim() : null,
      });
    },
    onError: (error) => fail(error, t("barber.agenda.blockError")),
    onSuccess: () => {
      setBlockStart("");
      setBlockEnd("");
      setFeedback({ message: t("barber.agenda.blockAdded"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-blocks"] });
    },
  });

  const removeBlock = useMutation({
    mutationFn: (id: string) => deleteScheduleOverride(supabase, id),
    onError: (error) => fail(error, t("barber.agenda.blockError")),
    onSuccess: () => {
      setFeedback({ message: t("barber.agenda.blockRemoved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-blocks"] });
    },
  });

  const busy = setStatus.isPending || addBlock.isPending || removeBlock.isPending;

  const renderAppointment = (appointment: BarberAgendaAppointment, withDate = false) => {
    const startsAt = formatInstantInShopTime(new Date(appointment.startsAt));
    const open = appointment.status === "scheduled" || appointment.status === "confirmed";
    const canConfirm = appointment.status === "scheduled" && new Date(appointment.endsAt) >= new Date();

    return (
      <Card key={appointment.id} testID={`barber-appointment-${appointment.id}`}>
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
              {withDate ? `${startsAt.localDate} ` : ""}
              {startsAt.localTime}
            </Text>
            <StatusBadge status={appointment.status} />
          </View>
          <Text className="text-base font-sans-medium text-ink">
            {t("barber.agenda.customerLine", { customer: appointment.customerName, service: appointment.serviceNameSnapshot })}
          </Text>
          <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
            {formatPriceBRL(appointment.servicePriceCentsSnapshot)}
          </Text>
          {open ? (
            <View className="flex-row flex-wrap gap-2">
              {canConfirm ? (
                <Button
                  disabled={busy}
                  label={t("barber.agenda.confirm")}
                  onPress={() => setStatus.mutate({ id: appointment.id, status: "confirmed" })}
                  size="sm"
                  testID={`barber-confirm-${appointment.id}`}
                />
              ) : null}
              <Button
                disabled={busy}
                label={t("barber.agenda.complete")}
                onPress={() => setStatus.mutate({ id: appointment.id, status: "completed" })}
                size="sm"
                testID={`barber-complete-${appointment.id}`}
              />
              <Button
                disabled={busy}
                label={t("barber.agenda.noShow")}
                onPress={() => setStatus.mutate({ id: appointment.id, status: "no_show" })}
                size="sm"
                testID={`barber-noshow-${appointment.id}`}
                variant="outline"
              />
            </View>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {t("barber.agenda.title")}
          </Text>
          {pending.length > 0 ? (
            <View className="w-full max-w-[420px] gap-3" testID="barber-pending-closure">
              <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">
                {t("barber.agenda.pendingTitle")}
              </Text>
              <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.pendingHint")}</Text>
              {pending.map((appointment) => renderAppointment(appointment, true))}
            </View>
          ) : null}
          <View className="w-full">
            <CalendarStrip days={days} onSelectDate={setPickedDate} selectedDate={selectedDate} />
          </View>
          <View className="w-full max-w-[420px] gap-3">
            {agenda.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {agenda.error ? (
              <Text className="text-sm font-sans text-danger-500">{errorMessage(agenda.error, t, t("barber.agenda.loadError"))}</Text>
            ) : null}
            {!agenda.isLoading && !agenda.error && dayAppointments.length === 0 ? <EmptyState title={t("barber.agenda.emptyDay")} /> : null}
            {dayAppointments.map((appointment) => renderAppointment(appointment))}
          </View>

          <View className="w-full max-w-[420px] gap-3">
            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">
              {t("barber.agenda.blocksTitle")}
            </Text>
            {dayBlocks.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.noBlocks")}</Text> : null}
            {dayBlocks.map((block) => (
              <Card key={block.id} variant="outlined">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                    {block.startTime ? t("barber.agenda.timeRange", { end: block.endTime, start: block.startTime }) : t("common.allDay")}
                  </Text>
                  <Button
                    disabled={busy}
                    label={t("barber.agenda.removeBlock")}
                    onPress={() => removeBlock.mutate(block.id)}
                    size="sm"
                    testID={`barber-block-remove-${block.id}`}
                    variant="danger"
                  />
                </View>
              </Card>
            ))}
            <Input {...field(0)} label={t("common.startTime")} onChangeText={setBlockStart} placeholder={"12:00"} testID="barber-block-start" value={blockStart} />
            <Input {...field(1)} label={t("common.endTime")} onChangeText={setBlockEnd} placeholder={"13:00"} testID="barber-block-end" value={blockEnd} />
            <Button
              disabled={busy || !barber.data}
              label={blockStart.trim() || blockEnd.trim() ? t("barber.agenda.addBlock") : t("barber.agenda.blockWholeDay")}
              onPress={() => addBlock.mutate()}
              testID="barber-block-add"
              variant="outline"
            />
          </View>
          <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
