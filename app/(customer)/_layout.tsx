import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { CalendarDays, CalendarPlus, House, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { ensureMyCustomer } from "../../src/features/account/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

const ACTIVE_TAB: Record<string, string> = { reschedule: "appointments" };

export default function CustomerLayout() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const items = [
    { icon: House, key: "home", label: t("tabs.home") },
    { icon: CalendarPlus, key: "book", label: t("tabs.book") },
    { icon: CalendarDays, key: "appointments", label: t("tabs.agenda") },
    { icon: User, key: "profile", label: t("tabs.profile") },
  ];
  const bootstrap = useQuery({
    enabled: profile?.role === "customer",
    queryFn: () => ensureMyCustomer(supabase),
    queryKey: ["ensure-my-customer", profile?.userId],
    staleTime: Infinity,
  });

  if (bootstrap.isError) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Text className="text-base font-sans text-danger-500">{t("layout.bootstrapError")}</Text>
          <Button label={t("common.tryAgain")} onPress={() => void bootstrap.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!bootstrap.data) {
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
      tabBar={({ navigation, state }) => {
        const name = state.routes[state.index].name;

        // Tab screens skip the bottom edge; the bar owns it so the system navigation area isn't padded twice.
        return (
          <Screen className="bg-surface" edges={["bottom", "left", "right"]}>
            <BottomTabBar
              activeKey={ACTIVE_TAB[name] ?? name}
              items={items}
              onSelect={(key) => navigation.navigate(key)}
            />
          </Screen>
        );
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="book" />
      <Tabs.Screen name="appointments" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="reschedule" options={{ href: null }} />
    </Tabs>
  );
}
