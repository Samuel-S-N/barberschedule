import { Bell, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { readInstallEnvironment } from "../install/environment";
import { InstallGuide } from "../install/InstallGuide";
import { resolveInstallState } from "../install/install-state";
import { readPromptKind } from "./prompt-kind";
import { hasBeenPrompted, markPrompted } from "./prompt-store";
import { useNotificationChannel } from "./use-notification-channel";
import type { PromptKind } from "./web-push-state";

// After the first sign-in (or account creation) on a device, once: ask to turn notifications on. Silent when the device cannot do
// push or the permission is already decided; an iPhone that has not installed the app is pointed to the install guide instead
// (iPhone only has Web Push for an app on the Home Screen). Runs for every role. "Turn on" calls `enable()` straight from the tap:
// browsers and iPhone drop the user activation after an await.
export function NotificationsPromptGate() {
  const colors = useColors();
  const { t } = useTranslation();
  const { profile } = useSupabaseSession();
  const channel = useNotificationChannel();
  const [kind, setKind] = useState<PromptKind | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const userId = profile?.userId ?? null;

  useEffect(() => {
    if (!userId) {
      setKind(null);

      return undefined;
    }
    let active = true;

    void (async () => {
      if (await hasBeenPrompted()) return;
      const next = await readPromptKind();

      if (!active || !next) return;
      // Remembered as soon as it is shown: reloading, or any way of closing it, never asks again on this device.
      await markPrompted();
      if (active) setKind(next);
    })().catch(() => undefined);

    return () => {
      active = false;
    };
  }, [userId]);

  if (!kind) return null;

  const close = () => setKind(null);
  const install = kind === "install" ? resolveInstallState(readInstallEnvironment()) : null;
  const guideVariant = install?.status === "installable-ios" && install.browser === "chrome" ? "ios-chrome" : "ios-other";

  return (
    <>
      <Modal animationType="fade" onRequestClose={close} transparent visible>
        <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={close} testID="notifications-prompt-backdrop">
          <Pressable className="w-full max-w-[360px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="notifications-prompt">
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1 flex-row items-center gap-2">
                <Bell color={colors.primary[600]} size={22} />
                <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{t("notificationsPrompt.title")}</Text>
              </View>
              <Pressable accessibilityLabel={t("notificationsPrompt.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={close} testID="notifications-prompt-close">
                <X color={colors.ink} size={22} />
              </Pressable>
            </View>
            <Text className="text-base font-sans text-neutral-700">{kind === "install" ? t("notificationsPrompt.installBody") : t("notificationsPrompt.body")}</Text>
            <View className="gap-2">
              {kind === "install" ? (
                <Button label={t("notificationsPrompt.installButton")} onPress={() => setGuideOpen(true)} testID="notifications-prompt-install" />
              ) : (
                <Button
                  label={t("notificationsPrompt.enable")}
                  onPress={() => {
                    void channel.enable();
                    close();
                  }}
                  testID="notifications-prompt-enable"
                />
              )}
              <Button label={t("notificationsPrompt.later")} onPress={close} testID="notifications-prompt-later" variant="ghost" />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <InstallGuide onClose={() => setGuideOpen(false)} variant={guideVariant} visible={guideOpen} />
    </>
  );
}
