import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { SafeAreaInsetsContext, useSafeAreaInsets } from "react-native-safe-area-context";

import { isDemoEnvironment } from "../../lib/demo";

// A thin strip above the whole app in the demo (dev) build. It takes its own space (never overlays a header, tab bar or button) and
// owns the top safe area: it pads by the inset itself and tells the screens below the top inset is 0, so they do not pad twice.
// Expo inlines `process.env.EXPO_PUBLIC_*` only for literal property reads.
export function DemoFrame({ children }: PropsWithChildren) {
  return isDemoEnvironment(process.env.EXPO_PUBLIC_APP_ENV) ? <DemoStrip>{children}</DemoStrip> : <>{children}</>;
}

// Separate component so production and tests never call the safe-area hook (it needs a provider above).
function DemoStrip({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <View className="bg-warning-400/30" style={{ paddingBottom: 4, paddingHorizontal: 12, paddingTop: insets.top + 4 }} testID="demo-banner">
        <Text className="text-center text-xs font-sans text-ink">{t("demo.banner")}</Text>
      </View>
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
