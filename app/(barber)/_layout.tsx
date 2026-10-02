import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { CalendarDays, Coins, User, Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { getMyBarberProfile } from "../../src/features/barbers/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function BarberLayout() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const items = [
    { icon: CalendarDays, key: "my-agenda", label: t("tabs.agenda") },
    { icon: Users, key: "clients", label: t("tabs.clients") },
    { icon: Coins, key: "earnings", label: t("tabs.earnings") },
    { icon: User, key: "my-profile", label: t("tabs.profile") },
  ];
  // Also proves the account is linked to an active barber row before any tab renders.
  const barber = useQuery({
    enabled: profile?.role === "barber",
    queryFn: () => getMyBarberProfile(supabase),
    queryKey: ["my-barber-profile", profile?.userId],
  });

  if (barber.isError) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Text className="text-base font-sans text-danger-500">{errorMessage(barber.error, t, t("barber.profile.loadError"))}</Text>
          <Button label={t("common.tryAgain")} onPress={() => void barber.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!barber.data) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="items-center gap-3 p-5">
          <SkeletonBlock height={56} width={320} />
          <SkeletonBlock height={56} width={320} />
        </View>
      </Screen>
    );
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ navigation, state }) => (
        <Screen className="bg-surface" edges={["bottom", "left", "right"]}>
          <BottomTabBar activeKey={state.routes[state.index].name} items={items} onSelect={(key) => navigation.navigate(key)} />
        </Screen>
      )}
    >
      <Tabs.Screen name="my-agenda" />
      <Tabs.Screen name="clients" />
      <Tabs.Screen name="earnings" />
      <Tabs.Screen name="my-profile" />
      <Tabs.Screen name="move-appointment" options={{ href: null }} />
    </Tabs>
  );
}
