import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { Button, SafeAreaView, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { z } from "zod";

import { bookAppointment } from "../../../src/features/appointments/api";
import { getAvailableSlotsQueryOptions } from "../../../src/features/availability/query";
import type { AvailableSlot } from "../../../src/features/availability/types";
import { listMyCustomers } from "../../../src/features/customers/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

const notesSchema = z.object({ notes: z.string().trim().max(500) });

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default function BookReviewScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; localDate?: string }>();
  const barberId = param(params.barberId);
  const barberServiceId = param(params.barberServiceId);
  const localDate = param(params.localDate);
  const { profile, supabase } = useSupabaseSession();
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const { control, handleSubmit } = useForm({ defaultValues: { notes: "" } });
  const availability = useQuery({
    ...getAvailableSlotsQueryOptions(supabase, { barberId, barberServiceId, localDate }),
    enabled: Boolean(barberId && barberServiceId && localDate),
  });
  const customers = useQuery({
    enabled: profile?.role === "customer",
    queryFn: () => listMyCustomers(supabase),
    queryKey: ["my-customers"],
  });
  const customer = customers.data?.find(
    (candidate) => candidate.active && candidate.userId === profile?.userId,
  );
  const selectedSlot = availability.data?.find((slot: AvailableSlot) => slot.startsAt === startsAt);
  const booking = useMutation({
    mutationFn: (notes: string) => {
      if (profile?.role !== "customer" || !customer || !startsAt) {
        throw new Error("Choose an available time before booking.");
      }
      return bookAppointment(supabase, {
        barberServiceId,
        customerId: customer.id,
        notes: notes || null,
        source: "customer",
        startsAt,
      });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : "Unable to book this appointment."),
    onSuccess: () => setFeedback("Booking confirmed."),
  });

  const submit = handleSubmit(({ notes }) => {
    const parsed = notesSchema.safeParse({ notes });
    if (!parsed.success) {
      setFeedback("Notes must be 500 characters or fewer.");
      return;
    }
    setFeedback(null);
    booking.mutate(parsed.data.notes);
  });

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll} testID="booking-review-scroll">
        <Text accessibilityRole="header" style={styles.title}>Review your booking</Text>
        <Text>{localDate}</Text>
        {availability.isLoading ? <Text>Loading available times…</Text> : null}
        {availability.error ? <Text>Unable to load availability.</Text> : null}
        {availability.data?.map((slot: AvailableSlot) => (
          <Button
            color={slot.startsAt === startsAt ? "#2563eb" : undefined}
            key={slot.startsAt}
            onPress={() => setStartsAt(slot.startsAt)}
            title={slot.localTime}
          />
        ))}
        {selectedSlot ? <Text>Selected time: {selectedSlot.localTime}</Text> : null}
        <Controller
          control={control}
          name="notes"
          render={({ field: { onBlur, onChange, value } }) => (
            <TextInput
              multiline
              onBlur={onBlur}
              onChangeText={onChange}
              placeholder="Notes (optional)"
              style={styles.input}
              value={value}
            />
          )}
        />
        {feedback ? <Text>{feedback}</Text> : null}
        <Button disabled={!startsAt || !customer || booking.isPending} onPress={submit} title="Confirm booking" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: "center", gap: 12, maxWidth: 420, paddingBottom: 24, width: "100%" },
  input: { borderColor: "#d1d5db", borderRadius: 8, borderWidth: 1, minHeight: 70, padding: 12 },
  screen: { backgroundColor: "#fff", flex: 1, padding: 24 },
  scroll: { flex: 1, width: "100%" },
  title: { color: "#111827", fontSize: 28, fontWeight: "700" },
});
