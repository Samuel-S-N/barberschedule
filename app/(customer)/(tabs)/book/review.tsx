import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { z } from "zod";

import { BookingSummary } from "../../../../src/components/domain/BookingSummary";
import { EmptyState } from "../../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { TimeSlotPicker } from "../../../../src/components/domain/TimeSlotPicker";
import type { TimeSlot } from "../../../../src/components/domain/TimeSlotPicker";
import { Toast } from "../../../../src/components/domain/Toast";
import { Button } from "../../../../src/components/ui/Button";
import { Input } from "../../../../src/components/ui/Input";
import { bookAppointment } from "../../../../src/features/appointments/api";
import { getAvailableSlotsQueryOptions } from "../../../../src/features/availability/query";
import type { AvailableSlot } from "../../../../src/features/availability/types";
import { listPublicBarbers } from "../../../../src/features/barbers/api";
import { listMyCustomers } from "../../../../src/features/customers/api";
import { useBarberServices } from "../../../../src/features/services/use-barber-services";
import { errorMessage } from "../../../../src/i18n/errors";
import { useLanguage } from "../../../../src/i18n/use-language";
import { formatDateNumeric } from "../../../../src/lib/i18n/format";
import { useSupabaseSession } from "../../../../src/providers/AppProviders";
import { Screen } from "../../../../src/components/ui/Screen";

const notesSchema = z.object({ notes: z.string().trim().max(500) });
// The button is disabled until a time is chosen, so this is only a safety net; it is mapped to text in onError.
const NO_SLOT_SELECTED = "NO_SLOT_SELECTED";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookReviewScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; localDate?: string; shopId?: string }>();
  const shopId = param(params.shopId);
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const localDate = param(params.localDate);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const language = useLanguage();
  const { profile, supabase } = useSupabaseSession();
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId && localDate),
  });
  const barbers = useQuery({
    enabled: Boolean(shopId),
    queryFn: () => listPublicBarbers(supabase, shopId),
    queryKey: ["public-barbers", shopId],
  });
  const services = useBarberServices(barberId);
  const option = services.data?.find((candidate) => candidate.barberServiceId === barberServiceId);
  const barber = barbers.data?.find((candidate) => candidate.id === barberId);
  const customers = useQuery({
    enabled: profile?.role === "customer",
    queryFn: () => listMyCustomers(supabase),
    queryKey: ["my-customers"],
  });
  const customer = customers.data?.find(
    (candidate) => candidate.active && candidate.userId === profile?.userId,
  );
  const booking = useMutation({
    mutationFn: (submittedNotes: string) => {
      if (profile?.role !== "customer" || !customer || !startsAt) {
        throw new Error(NO_SLOT_SELECTED);
      }
      return bookAppointment(supabase, {
        barberServiceId,
        customerId: customer.id,
        notes: submittedNotes || null,
        source: "customer",
        startsAt,
      });
    },
    onError: (error) => {
      setFeedback({
        message: errorMessage(
          error,
          t as never,
          error instanceof Error && error.message === NO_SLOT_SELECTED ? t("book.chooseTime") : t("book.error"),
        ),
        variant: "error",
      });
      // The slot may have just been taken by someone else; drop the stale choice and refetch the list.
      setStartsAt(null);
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
    },
    onSuccess: () => {
      // Home and Agenda stay mounted under the tab bar, so their cached lists must be refreshed explicitly.
      void queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      // Reset the booking stack so the Book tab starts over instead of showing this finished review.
      router.dismissAll();
      router.navigate(`/home?booked=${Date.now()}`);
    },
  });

  const slots: TimeSlot[] = (availability.data ?? []).map((slot: AvailableSlot) => ({
    status: slot.startsAt === startsAt ? "selected" : "free",
    time: slot.localTime,
  }));

  const selectSlot = (time: string) => {
    const match = availability.data?.find((slot: AvailableSlot) => slot.localTime === time);
    setStartsAt(match?.startsAt ?? null);
  };

  const submit = () => {
    const parsed = notesSchema.safeParse({ notes });
    if (!parsed.success) {
      setFeedback({ message: t("book.notesTooLong"), variant: "error" });
      return;
    }
    setFeedback(null);
    booking.mutate(parsed.data.notes);
  };

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1" testID="booking-review-scroll">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {t("book.reviewTitle")}
          </Text>
          {option && barber && localDate ? (
            <View className="w-full max-w-[420px]">
              <BookingSummary
                barberName={barber.name}
                dateLabel={formatDateNumeric(localDate, language)}
                durationMinutes={option.durationMinutes}
                priceCents={option.priceCents}
                serviceName={option.name ?? t("book.fallbackService")}
              />
            </View>
          ) : (
            <Text className="w-full max-w-[420px] text-base font-sans text-neutral-600">{localDate ? formatDateNumeric(localDate, language) : ""}</Text>
          )}
          <View className="w-full max-w-[420px] gap-2">
            {availability.isLoading ? (
              <>
                <SkeletonBlock height={56} width={320} />
                <SkeletonBlock height={56} width={320} />
              </>
            ) : null}
            {availability.error ? (
              <Text className="text-sm font-sans text-danger-500">{t("book.timesError")}</Text>
            ) : null}
            {!availability.isLoading && !availability.error && slots.length === 0 ? (
              <EmptyState title={t("book.noTimes")} />
            ) : null}
            {slots.length > 0 ? <TimeSlotPicker onSelectSlot={selectSlot} slots={slots} /> : null}
          </View>
          <View className="w-full max-w-[420px]">
            <Input label={t("book.notes")} multiline onChangeText={setNotes} testID="booking-notes-input" value={notes} />
          </View>
          <Toast
            message={feedback?.message ?? ""}
            onDismiss={() => setFeedback(null)}
            variant={feedback?.variant ?? "info"}
            visible={feedback !== null}
          />
          <View className="w-full max-w-[420px] gap-2">
            {customers.error ? (
              <>
                <Text className="text-sm font-sans text-danger-500">{t("book.customerError")}</Text>
                <Button label={t("common.tryAgain")} onPress={() => void customers.refetch()} variant="outline" />
              </>
            ) : null}
            {customers.isSuccess && !customer ? (
              <Text className="text-sm font-sans text-danger-500">{t("book.customerMissing")}</Text>
            ) : null}
            <Button
              disabled={!startsAt || !customer || booking.isPending}
              label={t("book.confirm")}
              onPress={submit}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
