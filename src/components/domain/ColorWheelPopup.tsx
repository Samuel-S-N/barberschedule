import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { ColorWheel } from "../ui/ColorWheel";
import { useColors } from "../../lib/design/theme/ThemeProvider";

export type ColorWheelPopupProps = { onChange: (hex: string) => void; onClose: () => void; title: string; value: string; visible: boolean };

// A centred floating pop-up (X top-right, tap outside closes) around the colour wheel. Every pick is applied at once, so closing
// keeps the last colour.
export function ColorWheelPopup({ onChange, onClose, title, value, visible }: ColorWheelPopupProps) {
  const colors = useColors();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID="color-wheel-backdrop">
        <Pressable className="w-full max-w-[360px] gap-4 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="color-wheel-popup">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("colorWheel.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="color-wheel-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <ColorWheel onChange={onChange} value={value} />
          {/* The preview colour is the data the owner is choosing, the one literal colour in this file. */}
          <View className="h-11 w-full rounded-xl border border-neutral-200" style={{ backgroundColor: value }} testID="color-wheel-preview" />
          <Button label={t("colorWheel.done")} onPress={onClose} testID="color-wheel-done" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
