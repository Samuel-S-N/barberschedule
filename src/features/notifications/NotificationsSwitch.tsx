import { Bell } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { Toggle } from "../../components/ui/Toggle";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { readInstallEnvironment } from "../install/environment";
import { InstallGuide } from "../install/InstallGuide";
import { resolveInstallState } from "../install/install-state";
import { useNotificationChannel } from "./use-notification-channel";

// Settings row, every role: notifications on/off for THIS device. Off deactivates this device's subscription/token (it cannot
// change the browser's own permission: if the browser blocked notifications the row says how to re-enable them there).
export function NotificationsSwitch() {
  const colors = useColors();
  const { t } = useTranslation();
  const { busy, disable, enable, error, state } = useNotificationChannel();
  const [guideOpen, setGuideOpen] = useState(false);

  if (state === "unsupported") return null;

  const hint =
    state === "denied" ? t("webPush.deniedBody") : state === "install" ? t("notificationsSwitch.installHint") : state === "on" ? t("notificationsSwitch.onHint") : t("notificationsSwitch.offHint");
  const row = (
    <View className="min-h-[56px] flex-row items-center gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4">
      <Bell color={colors.primary[600]} size={22} />
      <View className="flex-1 gap-1">
        <Text className="text-base font-sans-semibold text-ink">{t("notificationsSwitch.label")}</Text>
        <Text className="text-sm font-sans text-neutral-600" testID="notifications-switch-hint">{hint}</Text>
        {error ? <Text className="text-sm font-sans text-danger-500">{t("webPush.error")}</Text> : null}
      </View>
      <Toggle
        accessibilityLabel={t("notificationsSwitch.label")}
        disabled={busy || state === "denied" || state === "install"}
        onValueChange={(next) => void (next ? enable() : disable())}
        testID="notifications-switch"
        value={state === "on"}
      />
    </View>
  );

  if (state !== "install") return row;

  const install = resolveInstallState(readInstallEnvironment());
  const variant = install.status === "installable-ios" && install.browser === "chrome" ? "ios-chrome" : "ios-other";

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setGuideOpen(true)} testID="notifications-switch-install">{row}</Pressable>
      <InstallGuide onClose={() => setGuideOpen(false)} variant={variant} visible={guideOpen} />
    </>
  );
}
