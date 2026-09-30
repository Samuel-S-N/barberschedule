import Constants from "expo-constants";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Screen } from "../../../src/components/ui/Screen";
import { useBack } from "../../../src/lib/navigation/use-back";

export default function AboutScreen() {
  const { t } = useTranslation();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.about.title")} />
            <Text className="text-xl font-display-bold text-ink">{t("common.appName")}</Text>
            <Text className="text-base font-sans text-neutral-600" testID="about-version">
              {t("profile.about.version", { version: Constants.expoConfig?.version ?? "" })}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
