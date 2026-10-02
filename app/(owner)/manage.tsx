import { useRouter } from "expo-router";
import { AlertTriangle, Clock, Contact, Repeat, Scissors, Store, Users } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { MenuBlock } from "../../src/components/domain/MenuBlock";
import { Screen } from "../../src/components/ui/Screen";

export default function OwnerManageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const go = (path: string) => () => router.push(path as never);

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-5">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("owner.manage.title")}</Text>
            <MenuBlock
              items={[
                { icon: Users, key: "barbers", label: t("owner.hub.manageBarbers"), onPress: go("/barbers") },
                { icon: Scissors, key: "services", label: t("owner.hub.manageServices"), onPress: go("/services") },
                { icon: Contact, key: "customers", label: t("owner.hub.manageCustomers"), onPress: go("/customers") },
                { icon: Repeat, key: "monthly-customers", label: t("owner.manage.recurring"), onPress: go("/monthly-customers") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Clock, key: "schedule", label: t("owner.hub.manageSchedule"), onPress: go("/schedule") },
                { icon: Store, key: "shop", label: t("owner.settings.shopLink"), onPress: go("/shop") },
                { icon: AlertTriangle, key: "recurrence-conflicts", label: t("owner.manage.conflicts"), onPress: go("/recurrence-conflicts") },
              ]}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
