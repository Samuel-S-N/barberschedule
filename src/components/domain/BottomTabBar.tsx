import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type BottomTabItem = { key: string; label: string; icon: LucideIcon };

export type BottomTabBarProps = {
  items: BottomTabItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  testID?: string;
};

export function BottomTabBar({ items, activeKey, onSelect, testID }: BottomTabBarProps) {
  return (
    <View accessibilityRole="tablist" className="flex-row border-t border-neutral-200 bg-surface" testID={testID}>
      {items.map((item) => {
        const active = item.key === activeKey;
        const Icon = item.icon;

        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="min-h-[56px] min-w-[44px] flex-1 items-center justify-center gap-0.5"
            key={item.key}
            onPress={() => onSelect(item.key)}
            testID={`tab-${item.key}`}
          >
            <Icon color={active ? colors.primary[600] : colors.neutral[400]} size={24} />
            <Text className={`text-xs ${active ? "font-sans-semibold text-primary-600" : "font-sans-medium text-neutral-400"}`}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
