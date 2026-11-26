import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Button } from "../../src/components/ui/Button";
import { Screen } from "../../src/components/ui/Screen";
import { ShopLinkCard } from "../../src/features/shops/ShopLinkCard";
import { useBack } from "../../src/lib/navigation/use-back";

export default function OwnerShopLinkScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const router = useRouter();
  // `from=setup`: the owner has just opened the business (setup checklist), so this screen ends the setup and leads on to the panel.
  const { from } = useLocalSearchParams<{ from?: string }>();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("shopLinkScreen.title")} />
            <ShopLinkCard audience="owner" />
            {from === "setup" ? <Button label={t("shopLinkScreen.toAgenda")} onPress={() => router.replace("/agenda")} size="lg" testID="shop-link-to-agenda" /> : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
