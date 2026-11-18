import { Redirect } from "expo-router";
import { View } from "react-native";

import { SkeletonBlock } from "../../../../src/components/domain/SkeletonLoader";
import { Screen } from "../../../../src/components/ui/Screen";
import { useCurrentShop } from "../../../../src/features/shops/CurrentShopProvider";

// Booking always starts at the shop of the current address.
export default function BookIndexScreen() {
  const { shop } = useCurrentShop();

  if (shop) return <Redirect href={`/book/professional?shopId=${encodeURIComponent(shop.id)}`} />;

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <View className="flex-1 items-center gap-4 p-5">
        <SkeletonBlock height={60} width={320} />
      </View>
    </Screen>
  );
}
