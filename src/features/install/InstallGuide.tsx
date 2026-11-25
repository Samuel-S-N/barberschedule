import { Ellipsis, EllipsisVertical, Share, SquarePlus, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../../components/ui/Button";
import { useColors } from "../../lib/design/theme/ThemeProvider";

export type InstallGuideVariant = "firefox-android" | "ios-chrome" | "ios-other" | "mac-safari";

export function InstallGuide({ onClose, variant, visible }: { onClose: () => void; variant: InstallGuideVariant; visible: boolean }) {
  const colors = useColors();
  const { t } = useTranslation();

  if (!visible) return null;

  const icon = (Icon: typeof Share) => <Icon color={colors.primary[600]} size={18} />;
  const steps: Array<{ icon: ReactNode; text: string }> =
    variant === "mac-safari"
      ? [{ icon: icon(Share), text: t("install.stepMacShare") }, { icon: icon(SquarePlus), text: t("install.stepMacAdd") }]
      : variant === "firefox-android"
        ? [{ icon: icon(EllipsisVertical), text: t("install.stepFirefoxMenu") }, { icon: icon(SquarePlus), text: t("install.stepFirefoxInstall") }]
        : variant === "ios-chrome"
          ? [{ icon: icon(Ellipsis), text: t("install.stepMenuChrome") }, { icon: icon(SquarePlus), text: t("install.stepAddHome") }]
          : [
              { icon: <View className="flex-row gap-1">{icon(Share)}{icon(Ellipsis)}</View>, text: t("install.stepShareOrMenu") },
              { icon: icon(SquarePlus), text: t("install.stepAddHomeOrShare") },
            ];
  const title = variant === "mac-safari" ? t("install.macTitle") : variant === "firefox-android" ? t("install.firefoxTitle") : t("install.iosTitle");

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID="install-guide-backdrop">
        <Pressable className="w-full max-w-[420px] gap-4 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="install-guide">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("install.guideClose")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="install-guide-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View className="gap-3">
            {steps.map((step, index) => (
              <View className="flex-row items-center gap-3" key={index}>
                <View className="h-6 w-6 items-center justify-center rounded-full bg-primary-100">
                  <Text className="text-xs font-sans-bold text-primary-600" style={{ fontVariant: ["tabular-nums"] }}>{index + 1}</Text>
                </View>
                <View className="w-12 items-center">{step.icon}</View>
                <Text className="flex-1 text-sm font-sans-medium text-neutral-700">{step.text}</Text>
              </View>
            ))}
          </View>
          <Button label={t("install.guideGotIt")} onPress={onClose} testID="install-guide-done" variant="outline" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
