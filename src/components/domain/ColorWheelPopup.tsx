import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { ColorWheel } from "../ui/ColorWheel";
import { useColors } from "../../lib/design/theme/ThemeProvider";

export type ColorWheelPopupProps = { onChange: (hex: string) => void; onClose: () => void; title: string; value: string; visible: boolean };

// A centred floating pop-up (X top-right, tap outside closes) around the colour wheel. Every pick is applied at once, so closing
// keeps the last colour. Structure matters on a phone: the backdrop is a SIBLING behind the card and the card is a plain View, so no
// touchable wraps the wheel's native pan gesture; and the wheel gets its colour once, when the pop-up opens, so our re-renders never
// re-feed it while a finger is on it.
export function ColorWheelPopup({ onChange, onClose, title, value, visible }: ColorWheelPopupProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const [start, setStart] = useState(value);
  const [shown, setShown] = useState(value);

  // The colour shown in the preview follows the picks; the wheel's own start colour is taken only at each opening (the dependency
  // list is `[visible]` on purpose: later `value` changes must not re-feed the wheel while a finger is on it).
  useEffect(() => {
    if (visible) {
      setStart(value);
      setShown(value);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View className="flex-1 items-center justify-center p-5">
        <Pressable accessibilityLabel={t("colorWheel.close")} accessibilityRole="button" className="absolute inset-0 bg-black/40" onPress={onClose} testID="color-wheel-backdrop" />
        <View className="w-full max-w-[360px] gap-4 rounded-2xl bg-surface p-5" testID="color-wheel-popup">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("colorWheel.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="color-wheel-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <ColorWheel
            onChange={(hex) => {
              setShown(hex);
              onChange(hex);
            }}
            value={start}
          />
          {/* The preview colour is the data the owner is choosing, the one literal colour in this file. */}
          <View className="h-11 w-full rounded-xl border border-neutral-200" style={{ backgroundColor: shown }} testID="color-wheel-preview" />
          <Button label={t("colorWheel.done")} onPress={onClose} testID="color-wheel-done" />
        </View>
      </View>
    </Modal>
  );
}
