import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Button } from "../src/components/ui/Button";
import { Screen } from "../src/components/ui/Screen";
import { LEGAL_SECTION_KEYS, TERMS_VERSION } from "../src/features/account/legal";

export default function LegalScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("legal.title")}</Text>
            <Text className="text-sm font-sans text-neutral-500">{t("legal.version", { version: TERMS_VERSION })}</Text>
            <Text className="text-sm font-sans text-neutral-500">{t("legal.translationNote")}</Text>
            {LEGAL_SECTION_KEYS.map((key) => (
              <View className="gap-1" key={key}>
                <Text className="text-lg font-display-semibold text-ink">{t(`legal.sections.${key}.title`)}</Text>
                <Text className="text-base font-sans text-neutral-700">{t(`legal.sections.${key}.body`)}</Text>
              </View>
            ))}
            <Button label={t("common.back")} onPress={() => router.back()} variant="outline" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
