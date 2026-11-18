import { Bell, BellRing } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { readInstallEnvironment } from "../install/environment";
import { InstallGuide } from "../install/InstallGuide";
import { resolveInstallState } from "../install/install-state";
import { useWebPush } from "./use-web-push";

const CARD = "min-h-[56px] flex-row items-center justify-between gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4";

// Sits next to the install card on each profile hub. The permission prompt only ever follows a tap here (browsers and iPhone
// require it), never automatically.
export function NotificationPrompt() {
  const colors = useColors();
  const { t } = useTranslation();
  const { enable, error, state } = useWebPush();
  const [guideOpen, setGuideOpen] = useState(false);

  if (state === "hidden") return null;

  if (state === "ios-install") {
    const install = resolveInstallState(readInstallEnvironment());
    const variant = install.status === "installable-ios" && install.browser === "chrome" ? "ios-chrome" : "ios-other";

    return (
      <>
        <Pressable accessibilityRole="button" className={CARD} onPress={() => setGuideOpen(true)} testID="notify-card">
          <View className="flex-1 gap-1">
            <Text className="text-base font-sans-semibold text-ink">{t("webPush.iosTitle")}</Text>
            <Text className="text-sm font-sans text-neutral-600">{t("webPush.iosBody")}</Text>
          </View>
          <Bell color={colors.neutral[400]} size={20} />
        </Pressable>
        <InstallGuide onClose={() => setGuideOpen(false)} variant={variant} visible={guideOpen} />
      </>
    );
  }

  if (state === "on" || state === "denied") {
    const on = state === "on";

    return (
      <View className={CARD} testID="notify-card">
        <View className="flex-1 gap-1">
          <Text className="text-base font-sans-semibold text-ink">{on ? t("webPush.onTitle") : t("webPush.deniedTitle")}</Text>
          <Text className="text-sm font-sans text-neutral-600">{on ? t("webPush.onBody") : t("webPush.deniedBody")}</Text>
        </View>
        {on ? <BellRing color={colors.primary[600]} size={20} /> : <Bell color={colors.neutral[400]} size={20} />}
      </View>
    );
  }

  return (
    <View className={CARD} testID="notify-card">
      <View className="flex-1 gap-1">
        <Text className="text-base font-sans-semibold text-ink">{t("webPush.title")}</Text>
        <Text className="text-sm font-sans text-neutral-600">{t("webPush.body")}</Text>
        {error ? <Text className="text-sm font-sans text-danger-500">{t("webPush.error")}</Text> : null}
      </View>
      <Button label={t("webPush.button")} onPress={() => void enable()} size="sm" testID="notify-button" />
    </View>
  );
}
