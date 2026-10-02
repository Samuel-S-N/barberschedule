import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { BarberBookingSheet } from "../../src/components/domain/BarberBookingSheet";
import { CalendarStrip } from "../../src/components/domain/CalendarStrip";
import { DaySummaryCard } from "../../src/components/domain/DaySummaryCard";
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
import { bookAsBarber, searchMyCustomers, type BarberCustomerInput } from "../../src/features/appointments/barber-booking";
import { getMyClient } from "../../src/features/clients/api";
import { buildDayTimeline, slotFitsService } from "../../src/features/appointments/day-slots";
import { buildDaySummary } from "../../src/features/appointments/day-summary";
import { getAvailableSlots } from "../../src/features/availability/api";
import type { AvailableSlot } from "../../src/features/availability/types";
import { cancelAppointment, rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { getMyBarberProfile, listMyBarberServices } from "../../src/features/barbers/api";
import { getMyBarberReport } from "../../src/features/reports/api";
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
  const [bookingSlot, setBookingSlot] = useState<AvailableSlot | null>(null);
  const [customerTerm, setCustomerTerm] = useState("");
  // Cancel needs a second tap on the same card; moving carries the appointment until a free time is picked.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [moving, setMoving] = useState<BarberAgendaAppointment | null>(null);
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

  const services = useQuery({ queryFn: () => listMyBarberServices(supabase), queryKey: ["my-barber-services"] });
  const activeServices = useMemo(() => (services.data ?? []).filter((service) => service.active), [services.data]);
  // Free times come from the shortest service; the sheet then disables services that do not fit the chosen time.
  const shortest = useMemo(() => [...activeServices].sort((a, b) => a.durationMinutes - b.durationMinutes)[0] ?? null, [activeServices]);
  const slots = useQuery({
    enabled: Boolean(barber.data && shortest),
    queryFn: () => getAvailableSlots(supabase, { barberId: barber.data?.id ?? "", barberServiceId: shortest?.barberServiceId ?? "", localDate: selectedDate }),
    queryKey: ["barber-slots", barber.data?.id, shortest?.barberServiceId, selectedDate],
  });
  const customers = useQuery({
    enabled: bookingSlot !== null,
    queryFn: () => searchMyCustomers(supabase, customerTerm),
    queryKey: ["barber-customers", customerTerm],
  });

  const pending = useMemo(() => pendingClosure(pendingAgenda.data ?? []), [pendingAgenda.data]);
  const grouped = useMemo(() => groupByLocalDate(agenda.data ?? []), [agenda.data]);
  const days = useMemo(() => markAppointmentDays(buildCalendarStripDays(new Date(), DAYS_AHEAD, language), grouped), [grouped, language]);
  const dayAppointments = grouped.get(selectedDate) ?? [];
  const timeline = useMemo(() => buildDayTimeline(dayAppointments, slots.data ?? []), [dayAppointments, slots.data]);
  const showEarned = selectedDate <= today;
  // Booking again for a known client (from the client screen): the agenda carries `bookFor` until the booking is done or cancelled.
  const router = useRouter();
  const { bookFor } = useLocalSearchParams<{ bookFor?: string }>();
  const bookClient = useQuery({ enabled: Boolean(bookFor), queryFn: () => getMyClient(supabase, bookFor ?? ""), queryKey: ["my-client", bookFor] });
  const initialCustomer = useMemo(
    () => (bookClient.data ? { email: bookClient.data.customer.email, fullName: bookClient.data.customer.fullName, hasAccount: bookClient.data.customer.hasAccount, id: bookClient.data.customer.id, phone: bookClient.data.customer.phone } : null),
    [bookClient.data],
  );
  const clearBookFor = () => router.setParams({ bookFor: undefined });
  const earned = useQuery({
    enabled: showEarned,
    queryFn: () => getMyBarberReport(supabase, selectedDate, selectedDate),
    queryKey: ["barber-report", selectedDate, selectedDate],
  });
  const summary = useMemo(() => buildDaySummary(dayAppointments, slots.data ?? [], new Date()), [dayAppointments, slots.data]);
  const nextBusyStart = useMemo(() => {
    if (!bookingSlot) return null;
    const startsAt = bookingSlot.startsAt;

    return dayAppointments.filter((a) => a.status !== "cancelled" && a.startsAt > startsAt).map((a) => a.startsAt).sort()[0] ?? null;
  }, [bookingSlot, dayAppointments]);
  const dayBlocks = (blocks.data ?? []).filter((block) => block.localDate === selectedDate && block.kind === "block");

  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });

  useEffect(() => {
    if (bookClient.error) {
      fail(bookClient.error, t("barber.clients.detailError"));
      router.setParams({ bookFor: undefined });
    }
  }, [bookClient.error]);

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BarberAppointmentStatus }) => setMyAppointmentStatus(supabase, input.id, input.status),
    onError: (error) => fail(error, t("barber.agenda.updateError")),
    onSuccess: () => {
      setFeedback({ message: t("barber.agenda.updated"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-earnings"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-report"] });
    },
  });

  const refreshAgenda = () => {
    void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
    void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
    void queryClient.invalidateQueries({ queryKey: ["barber-report"] });
  };

  const cancel = useMutation({
    mutationFn: (id: string) => cancelAppointment(supabase, id),
    onError: (error) => fail(error, t("barber.agenda.updateError")),
    onSettled: () => setConfirmCancelId(null),
    onSuccess: () => {
      setFeedback({ message: t("barber.agenda.appointmentCancelled"), variant: "success" });
      refreshAgenda();
    },
  });

  const move = useMutation({
    mutationFn: (input: { id: string; startsAt: string }) => rescheduleAppointment(supabase, input.id, input.startsAt),
    onError: (error) => {
      fail(error, t("barber.agenda.updateError"));
      void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
    },
    onSuccess: () => {
      setMoving(null);
      setFeedback({ message: t("barber.agenda.appointmentMoved"), variant: "success" });
      refreshAgenda();
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

  const book = useMutation({
    mutationFn: (input: { barberServiceId: string; customer: BarberCustomerInput | { id: string } }) => {
      if (!bookingSlot) throw new Error("No slot selected.");

      return bookAsBarber(supabase, { barberServiceId: input.barberServiceId, customer: input.customer, startsAt: bookingSlot.startsAt });
    },
    onError: (error) => {
      fail(error, t("barber.agenda.bookError"));
      void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
    },
    onSuccess: () => {
      setBookingSlot(null);
      if (bookFor) clearBookFor();
      setFeedback({ message: t("barber.agenda.bookSuccess"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-customers"] });
    },
  });

  const busy = setStatus.isPending || addBlock.isPending || removeBlock.isPending || book.isPending || cancel.isPending || move.isPending;

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
              <Button
                disabled={busy}
                label={t("barber.agenda.moveAppointment")}
                onPress={() => {
                  setConfirmCancelId(null);
                  setMoving(appointment);
                }}
                size="sm"
                testID={`barber-move-${appointment.id}`}
                variant="outline"
              />
              <Button
                disabled={busy}
                label={confirmCancelId === appointment.id ? t("barber.agenda.cancelConfirm") : t("barber.agenda.cancelAppointment")}
                onPress={() => (confirmCancelId === appointment.id ? cancel.mutate(appointment.id) : setConfirmCancelId(appointment.id))}
                size="sm"
                testID={`barber-cancel-${appointment.id}`}
                variant="danger"
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
          {moving ? (
            <View className="w-full max-w-[420px]">
              <Card testID="barber-moving">
                <View className="gap-2">
                  <Text className="text-sm font-sans-medium text-ink">{t("barber.agenda.moving", { name: moving.customerName })}</Text>
                  <Button label={t("barber.agenda.moveCancel")} onPress={() => setMoving(null)} size="sm" testID="barber-moving-cancel" variant="outline" />
                </View>
              </Card>
            </View>
          ) : null}
          {bookFor && initialCustomer ? (
            <View className="w-full max-w-[420px]">
              <Card testID="barber-booking-for">
                <View className="gap-2">
                  <Text className="text-sm font-sans-medium text-ink">{t("barber.agenda.bookingFor", { name: initialCustomer.fullName })}</Text>
                  <Button label={t("barber.agenda.bookCancel")} onPress={clearBookFor} size="sm" testID="barber-booking-for-cancel" variant="outline" />
                </View>
              </Card>
            </View>
          ) : null}
          <View className="w-full max-w-[420px]">
            <DaySummaryCard earnedCents={showEarned ? (earned.data?.days[0]?.earningsCents ?? 0) : null} summary={summary} testID="barber-day-summary" />
          </View>
          <View className="w-full max-w-[420px] gap-3">
            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">
              {t("barber.agenda.slotsTitle")}
            </Text>
            {agenda.isLoading || slots.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {agenda.error ? (
              <Text className="text-sm font-sans text-danger-500">{errorMessage(agenda.error, t, t("barber.agenda.loadError"))}</Text>
            ) : null}
            {!agenda.isLoading && !agenda.error && !slots.isLoading && timeline.length === 0 ? <EmptyState title={t("barber.agenda.noFreeSlots")} /> : null}
            {timeline.map((entry) =>
              entry.kind === "appointment" ? (
                renderAppointment(entry.appointment)
              ) : (
                <Pressable
                  accessibilityRole="button"
                  className="flex-row items-center justify-between rounded-xl border border-dashed border-neutral-300 p-3"
                  key={`free-${entry.slot.startsAt}`}
                  onPress={() => (moving ? move.mutate({ id: moving.id, startsAt: entry.slot.startsAt }) : setBookingSlot(entry.slot))}
                  testID="barber-free-slot"
                >
                  <Text className="text-lg font-display-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
                    {entry.time}
                  </Text>
                  <Text className="text-sm font-sans text-neutral-600">{t("barber.agenda.freeSlot")}</Text>
                </Pressable>
              ),
            )}
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
          <BarberBookingSheet
            busy={book.isPending}
            initialCustomer={initialCustomer}
            preferredServiceName={bookClient.data?.stats.favoriteService ?? null}
            fitsService={(service) => (bookingSlot ? slotFitsService(bookingSlot, nextBusyStart, service.durationMinutes) : true)}
            onClose={() => setBookingSlot(null)}
            onSearch={setCustomerTerm}
            onSubmit={(input) => book.mutate(input)}
            recent={customers.data ?? []}
            services={activeServices}
            slotLabel={bookingSlot?.localTime ?? ""}
            visible={bookingSlot !== null}
          />
          <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
