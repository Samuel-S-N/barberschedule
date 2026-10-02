import { Tabs } from "expo-router";
import { CalendarDays, Coins, LayoutGrid, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";
import { Screen } from "../../src/components/ui/Screen";

// Screens reached from the Manage menu: not tabs themselves, and they keep "Manage" highlighted.
const MANAGE_SCREENS = ["appointment-form", "barbers", "customers", "monthly-customers", "recurrence-conflicts", "schedule", "services", "shop"] as const;
// Reached from the Account tab.
const ACCOUNT_SCREENS = ["language"] as const;

export default function OwnerLayout() {
  const { t } = useTranslation();
  const items = [
    { icon: CalendarDays, key: "agenda", label: t("tabs.agenda") },
    { icon: Coins, key: "revenue", label: t("tabs.revenue") },
    { icon: LayoutGrid, key: "manage", label: t("tabs.manage") },
    { icon: User, key: "settings", label: t("tabs.account") },
  ];
  const highlight = (name: string) => ((MANAGE_SCREENS as readonly string[]).includes(name) ? "manage" : (ACCOUNT_SCREENS as readonly string[]).includes(name) ? "settings" : name);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ navigation, state }) => (
        <Screen className="bg-surface" edges={["bottom", "left", "right"]}>
          <BottomTabBar activeKey={highlight(state.routes[state.index].name)} items={items} onSelect={(key) => navigation.navigate(key)} />
        </Screen>
      )}
    >
      <Tabs.Screen name="agenda" />
      <Tabs.Screen name="revenue" />
      <Tabs.Screen name="manage" />
      <Tabs.Screen name="settings" />
      {[...MANAGE_SCREENS, ...ACCOUNT_SCREENS].map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
