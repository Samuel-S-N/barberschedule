import { useRouter } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Screen } from "../../../src/components/ui/Screen";
import { useBack } from "../../../src/lib/navigation/use-back";

export default function SecurityScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.security.title")} />
            <MenuBlock
              items={[{ icon: KeyRound, key: "password", label: t("profile.security.passwordItem"), onPress: () => router.push("/me/security/password") }]}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
