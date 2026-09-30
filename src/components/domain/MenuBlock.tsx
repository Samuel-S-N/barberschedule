import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type MenuRowItem = { key: string; label: string; icon: LucideIcon; onPress: () => void };

export type MenuBlockProps = { items: MenuRowItem[]; testID?: string };

export function MenuBlock({ items, testID }: MenuBlockProps) {
  return (
    <View className="overflow-hidden rounded-[20px] border border-neutral-200 bg-surface" testID={testID}>
      {items.map((item, index) => {
        const Icon = item.icon;

        return (
          <Pressable
            accessibilityRole="button"
            className={`min-h-[56px] flex-row items-center gap-3 px-4 ${index > 0 ? "border-t border-neutral-200" : ""}`}
            key={item.key}
            onPress={item.onPress}
            testID={`menu-${item.key}`}
          >
            <Icon color={colors.primary[600]} size={22} />
            <Text className="flex-1 text-base font-sans-medium text-ink">{item.label}</Text>
            <ChevronRight color={colors.neutral[400]} size={20} />
          </Pressable>
        );
      })}
    </View>
  );
}
