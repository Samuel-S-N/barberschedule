import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type RadioOption = { key: string; label: string; selected: boolean; onPress: () => void };

export type RadioBlockProps = { items: RadioOption[]; testID?: string };

export function RadioBlock({ items, testID }: RadioBlockProps) {
  return (
    <View accessibilityRole="radiogroup" className="overflow-hidden rounded-[20px] border border-neutral-200 bg-surface" testID={testID}>
      {items.map((item, index) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: item.selected }}
          aria-checked={item.selected}
          className={`min-h-[56px] flex-row items-center gap-3 px-4 ${index > 0 ? "border-t border-neutral-200" : ""}`}
          key={item.key}
          onPress={item.onPress}
          testID={`option-${item.key}`}
        >
          <Text className={`flex-1 text-base ${item.selected ? "font-sans-semibold text-ink" : "font-sans-medium text-neutral-700"}`}>{item.label}</Text>
          {item.selected ? <Check color={colors.primary[600]} size={22} /> : null}
        </Pressable>
      ))}
    </View>
  );
}
