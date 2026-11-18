import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import type { ThemeInput } from "../../lib/design/theme/derive";
import { ThemeScope } from "../../lib/design/theme/ThemeProvider";

// A small sample of the app painted with the draft colours; only this subtree changes while the owner chooses.
export function ThemePreview({ input }: { input: ThemeInput }) {
  const { t } = useTranslation();

  return (
    <ThemeScope className="rounded-[20px] border border-neutral-200 bg-canvas p-4" input={input}>
      <View className="gap-3" testID="theme-preview">
        <Text accessibilityRole="header" className="font-display-bold text-xl text-ink">{t("owner.appearance.preview.title")}</Text>
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-semibold text-sm text-primary-600">{t("owner.appearance.preview.tab")}</Text>
          <Text className="font-display-bold text-xl text-primary-600">{t("owner.appearance.preview.price")}</Text>
        </View>
        <View className="rounded-[20px] border-[1.5px] border-primary-400 bg-primary-50 p-3">
          <Text className="font-sans-semibold text-base text-ink">{t("owner.appearance.preview.selected")}</Text>
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-ink">
          <Text className="font-sans-semibold text-base text-white">12</Text>
        </View>
        <Button label={t("owner.appearance.preview.action")} onPress={() => undefined} />
      </View>
    </ThemeScope>
  );
}
