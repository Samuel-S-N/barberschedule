import { SquarePlus } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { InstallGuide } from "./InstallGuide";
import { useInstallPrompt } from "./use-install-prompt";

const CARD = "min-h-[56px] flex-row items-center justify-between gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4";

// "Add Zenc to your home screen", on the profile hub only (never as an automatic pop-up). One card per situation: Chrome gets
// the browser's own prompt, iPhone/iPad and Safari on Mac get a short guide, everything else shows nothing.
export function InstallPrompt() {
  const colors = useColors();
  const { t } = useTranslation();
  const install = useInstallPrompt();
  const [guideOpen, setGuideOpen] = useState(false);

  if (install.status === "native" || install.status === "installed" || install.status === "unsupported") return null;

  if (install.status === "installable-chrome") {
    const { promptEvent } = install;

    return (
      <View className={CARD} testID="install-card">
        <View className="flex-1 gap-1">
          <Text className="text-base font-sans-semibold text-ink">{t("install.chromeTitle")}</Text>
          <Text className="text-sm font-sans text-neutral-600">{t("install.chromeBody")}</Text>
        </View>
        <Button
          label={t("install.chromeButton")}
          onPress={() => void promptEvent.prompt().then(() => promptEvent.userChoice).catch(() => undefined)}
          size="sm"
          testID="install-button"
        />
      </View>
    );
  }

  const mac = install.status === "installable-mac-safari";
  const variant = mac ? "mac-safari" : install.browser === "chrome" ? "ios-chrome" : "ios-other";
  const title = mac ? t("install.macTitle") : t("install.iosTitle");

  return (
    <>
      <Pressable accessibilityLabel={title} accessibilityRole="button" className={CARD} onPress={() => setGuideOpen(true)} testID="install-card">
        <View className="flex-1 gap-1">
          <Text className="text-base font-sans-semibold text-ink">{title}</Text>
          <Text className="text-sm font-sans text-neutral-600">{mac ? t("install.macBody") : t("install.iosBody")}</Text>
        </View>
        <SquarePlus color={colors.neutral[400]} size={20} />
      </Pressable>
      <InstallGuide onClose={() => setGuideOpen(false)} variant={variant} visible={guideOpen} />
    </>
  );
}
