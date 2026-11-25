import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Screen } from "../../src/components/ui/Screen";
import { ShopLinkCard } from "../../src/features/shops/ShopLinkCard";
import { useBack } from "../../src/lib/navigation/use-back";

export default function OwnerShopLinkScreen() {
  const { t } = useTranslation();
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("shopLinkScreen.title")} />
            <ShopLinkCard audience="owner" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
