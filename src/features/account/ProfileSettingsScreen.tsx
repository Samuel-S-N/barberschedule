import { useRouter } from "expo-router";
import { Globe } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { MenuBlock } from "../../components/domain/MenuBlock";
import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { Screen } from "../../components/ui/Screen";
import { useBack } from "../../lib/navigation/use-back";
import { NotificationsSwitch } from "../notifications/NotificationsSwitch";
import { SignOutButton } from "./SignOutButton";

// Settings is the same for every role: language and notifications. `languageHref` is the role's own language route; only the customer
// shows sign out here (the other roles have it on their own hubs).
export function ProfileSettingsScreen({ languageHref, showSignOut = false }: { languageHref: string; showSignOut?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.settings.title")} />
            <MenuBlock items={[{ icon: Globe, key: "language", label: t("profile.settings.language"), onPress: () => router.push(languageHref as never) }]} />
            <NotificationsSwitch />
            {showSignOut ? <SignOutButton /> : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
