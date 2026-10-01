import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { AppointmentCard } from "../../../src/components/domain/AppointmentCard";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ErrorRetry } from "../../../src/components/domain/ErrorRetry";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { ShopInfoCard } from "../../../src/components/domain/ShopInfoCard";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { listMyAppointments } from "../../../src/features/appointments/lifecycle";
import { useAppointmentCards } from "../../../src/features/appointments/use-appointment-cards";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { useShopInfo } from "../../../src/features/shops/use-shop-info";
import { listMyCustomers } from "../../../src/features/customers/api";
import { useRefresh } from "../../../src/lib/use-refresh";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { Screen } from "../../../src/components/ui/Screen";

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { booked } = useLocalSearchParams<{ booked?: string }>();
  const [confirmed, setConfirmed] = useState(false);
  const { supabase } = useSupabaseSession();

  // `booked` is a fresh timestamp after each confirmed booking, so every booking shows the message once.
  useEffect(() => {
    if (booked) setConfirmed(true);
  }, [booked]);
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const upcoming = useQuery({ queryFn: () => listMyAppointments(supabase), queryKey: ["my-appointments", "upcoming"] });
  const toCardProps = useAppointmentCards(upcoming.data ?? []);
  const next = upcoming.data?.[0];
  const profile = useMyProfile();
  const { hours, shop } = useShopInfo();
  const refresh = useRefresh([upcoming.refetch, customers.refetch]);
  const firstName = profile.data?.nickname || customers.data?.[0]?.fullName.split(" ")[0];

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1" refreshControl={<RefreshControl onRefresh={refresh.onRefresh} refreshing={refresh.refreshing} />}>
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {firstName ? t("home.greeting", { name: firstName }) : t("home.welcome")}
          </Text>
          <View className="w-full max-w-[420px] gap-3">
            <Text className="text-sm font-sans-medium text-neutral-600">{t("home.nextAppointment")}</Text>
            {upcoming.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {upcoming.error ? <ErrorRetry message={t("home.loadError")} onRetry={() => void upcoming.refetch()} testID="home-retry" /> : null}
            {!upcoming.isLoading && !upcoming.error && !next ? <EmptyState title={t("home.empty")} /> : null}
            {next ? <AppointmentCard {...toCardProps(next)} onPress={() => router.push("/appointments")} testID="home-next-appointment" /> : null}
            <Button label={t("home.bookCta")} onPress={() => router.push("/book")} size="lg" />
            {shop ? <ShopInfoCard hours={hours} shop={shop} /> : null}
          </View>
          <Toast message={t("home.bookingConfirmed")} onDismiss={() => setConfirmed(false)} variant="success" visible={confirmed} />
        </View>
      </ScrollView>
    </Screen>
  );
}
