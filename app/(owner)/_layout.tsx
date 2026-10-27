import { Tabs } from "expo-router";
import { CalendarDays, Coins, LayoutGrid, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { BottomTabBar } from "../../src/components/domain/BottomTabBar";
import { Screen } from "../../src/components/ui/Screen";
import { selectTab } from "../../src/lib/navigation/select-tab";
import { usePushRegistration } from "../../src/features/notifications/use-push-registration";
import { useHardwareBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Screens reached from the Manage menu: not tabs themselves, and they keep "Manage" highlighted.
const MANAGE_SCREENS = ["appointment-form", "barber-new", "barber-profile", "barbers", "conflict-reschedule", "customer-form", "customers", "monthly-customers", "recurrence-conflicts", "recurrence-manual", "recurrence-plan-form", "recurrence-plans", "schedule", "service-form", "services", "shop"] as const;
// Reached from the Agenda tab (the bell).
const AGENDA_SCREENS = ["my-barber-agenda", "owner-notifications"] as const;
// Reached from the Account tab.
const ACCOUNT_SCREENS = ["language", "owner-profile"] as const;

export default function OwnerLayout() {
  const { t } = useTranslation();
  const { profile } = useSupabaseSession();
  const items = [
    { icon: CalendarDays, key: "agenda", label: t("tabs.agenda") },
    { icon: Coins, key: "revenue", label: t("tabs.revenue") },
    { icon: LayoutGrid, key: "manage", label: t("tabs.manage") },
    { icon: User, key: "settings", label: t("tabs.account") },
  ];
  usePushRegistration(profile?.role === "owner");
  useHardwareBack();
  const highlight = (name: string) => ((MANAGE_SCREENS as readonly string[]).includes(name) ? "manage" : (ACCOUNT_SCREENS as readonly string[]).includes(name) ? "settings" : (AGENDA_SCREENS as readonly string[]).includes(name) ? "agenda" : name);

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      tabBar={({ navigateToTab, state }) => (
        <Screen className="bg-surface" edges={["bottom", "left", "right"]}>
          <BottomTabBar activeKey={highlight(state.routes[state.index].name)} items={items} onSelect={(key) => selectTab(state, navigateToTab, key)} />
        </Screen>
      )}
    >
      <Tabs.Screen name="agenda" />
      <Tabs.Screen name="revenue" />
      <Tabs.Screen name="manage" />
      <Tabs.Screen name="settings" />
      {/* Declared WITHOUT `href: null`: since SDK 58 a hidden or undeclared route is not navigable (the navigator redirects to the
          first tab), and the custom tab bar already shows only the four items above. */}
      {[...MANAGE_SCREENS, ...ACCOUNT_SCREENS, ...AGENDA_SCREENS].map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
