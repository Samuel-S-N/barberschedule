import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { SafeAreaView, ScrollView, Text, View } from "react-native";

import { AppointmentCard } from "../../src/components/domain/AppointmentCard";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { listMyAppointments } from "../../src/features/appointments/lifecycle";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { listMyCustomers } from "../../src/features/customers/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const toCardProps = useAppointmentCards(upcoming.data ?? []);
  const next = upcoming.data?.[0];
  const firstName = customers.data?.[0]?.fullName.split(" ")[0];

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {firstName ? `Hi, ${firstName}` : "Welcome"}
          </Text>
          <View className="w-full max-w-[420px] gap-3">
            <Text className="text-sm font-sans-medium text-neutral-600">Your next appointment</Text>
            {upcoming.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {upcoming.error ? <Text className="text-sm font-sans text-danger-500">Unable to load appointments.</Text> : null}
            {!upcoming.isLoading && !upcoming.error && !next ? <EmptyState title="No upcoming appointments" /> : null}
            {next ? <AppointmentCard {...toCardProps(next)} onPress={() => router.push("/agenda")} testID="home-next-appointment" /> : null}
            <Button label="Book an appointment" onPress={() => router.push("/book")} size="lg" />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
