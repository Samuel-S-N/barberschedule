import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import { useBack } from "../../../src/lib/navigation/use-back";

// Barbers cannot delete their own account (the owner manages it), so this screen only explains that and links the terms.
export default function BarberPrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.privacy.title")} />
            <Text className="text-base font-sans text-neutral-700" testID="barber-privacy-note">{t("barber.profile.privacyNote")}</Text>
            <Button label={t("profile.terms")} onPress={() => router.push("/legal")} testID="barber-privacy-terms" variant="outline" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
