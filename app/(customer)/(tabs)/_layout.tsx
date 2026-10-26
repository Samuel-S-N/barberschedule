import { usePathname } from "expo-router";
import { TopTabs } from "expo-router/js-top-tabs";
import { CalendarDays, CalendarPlus, House, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";

import { BottomTabBar } from "../../../src/components/domain/BottomTabBar";
import { Screen } from "../../../src/components/ui/Screen";
import { colors } from "../../../src/lib/design/colors";
import { selectTab } from "../../../src/lib/navigation/select-tab";
import { isTabSwipeEnabled } from "../../../src/lib/navigation/tab-swipe";

export default function TabsLayout() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const items = [
    { icon: House, key: "home", label: t("tabs.home") },
    { icon: CalendarPlus, key: "book", label: t("tabs.book") },
    { icon: CalendarDays, key: "appointments", label: t("tabs.agenda") },
    { icon: User, key: "profile", label: t("tabs.profile") },
  ];

  return (
    <TopTabs
      screenOptions={{
        // Not lazy: every page is mounted so the next one is already visible while the finger drags it in.
        lazy: false,
        sceneStyle: { backgroundColor: colors.canvas },
        swipeEnabled: isTabSwipeEnabled(pathname),
      }}
      tabBar={({ navigateToTab, state }) => (
        // Tab screens skip the bottom edge; the bar owns it so the system navigation area isn't padded twice.
        <Screen className="bg-surface" edges={["bottom", "left", "right"]}>
          <BottomTabBar
            activeKey={state.routes[state.index].name}
            items={items}
            onSelect={(key) => selectTab(state, navigateToTab, key)}
          />
        </Screen>
      )}
      tabBarPosition="bottom"
    >
      <TopTabs.Screen name="home" />
      <TopTabs.Screen name="book" />
      <TopTabs.Screen name="appointments" />
      <TopTabs.Screen name="profile" />
    </TopTabs>
  );
}
