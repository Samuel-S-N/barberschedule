import { useTranslation } from "react-i18next";
import { Text, View, useColorScheme } from "react-native";

import { WORDMARK_COLOR, WORDMARK_TEXT } from "../../lib/design/brand";

export type WordmarkProps = { scheme?: "dark" | "light"; size?: number };

// ZENC. in Oswald Bold with the period drawn as a circle (the "icon is the name" decision, ADR 017). No image asset: text + a View.
export function Wordmark({ scheme, size = 44 }: WordmarkProps) {
  const { t } = useTranslation();
  const system = useColorScheme();
  const dot = Math.round(size * 0.18);
  const color = WORDMARK_COLOR[(scheme ?? system) === "dark" ? "dark" : "light"];

  return (
    <View accessibilityLabel={t("common.appName")} accessibilityRole="image" className="flex-row items-end self-center" testID="wordmark">
      <Text className="font-display-bold text-ink" style={{ fontSize: size, letterSpacing: size * 0.06, lineHeight: size * 1.1 }}>{WORDMARK_TEXT}</Text>
      <View style={{ backgroundColor: color, borderRadius: dot, height: dot, marginBottom: size * 0.14, marginLeft: size * 0.05, width: dot }} testID="wordmark-dot" />
    </View>
  );
}
