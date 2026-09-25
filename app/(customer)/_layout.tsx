import { useQuery } from "@tanstack/react-query";
import { Tabs } from "expo-router";
import { CalendarDays, CalendarPlus, House, User } from "lucide-react-native";
import { Text, View } from "react-native";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { ensureMyCustomer } from "../../src/features/account/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

const ITEMS = [
  { icon: House, key: "home", label: "Home" },
  { icon: CalendarPlus, key: "book", label: "Book" },
  { icon: CalendarDays, key: "appointments", label: "Agenda" },
  { icon: User, key: "profile", label: "Profile" },
];
const ACTIVE_TAB: Record<string, string> = { reschedule: "appointments" };

export default function CustomerLayout() {
  const { profile, supabase } = useSupabaseSession();
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
          <Text className="text-base font-sans text-danger-500">Unable to set up your account.</Text>
          <Button label="Try again" onPress={() => void bootstrap.refetch()} />
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
              items={ITEMS}
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
