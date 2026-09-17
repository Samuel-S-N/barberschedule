import type { ComponentType } from "react";
import { Text, View } from "react-native";
import { Scissors } from "lucide-react-native";

import { colors } from "../../lib/design/colors";
import { Button } from "../ui/Button";

export type EmptyStateProps = {
  icon?: ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
};

export function EmptyState({
  icon: Icon = Scissors,
  title,
  subtitle,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View className="items-center gap-3 p-8" testID={testID}>
      <View className="h-24 w-24 items-center justify-center rounded-full bg-neutral-100">
        <Icon color={colors.neutral[300]} size={40} />
      </View>
      <Text className="text-lg font-display-semibold text-ink text-center">{title}</Text>
      {subtitle ? (
        <Text className="text-sm font-sans text-neutral-500 text-center">{subtitle}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="sm" />
      ) : null}
    </View>
  );
}
