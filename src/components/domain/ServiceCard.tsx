import { Pressable, Text, View } from "react-native";
import { Clock, Scissors } from "lucide-react-native";

import { colors } from "../../lib/design/colors";

export type ServiceCardProps = {
  name: string;
  durationMinutes: number;
  priceCents: number;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function formatPriceBRL(cents: number): string {
  const reais = Math.floor(cents / 100);
  const remainingCents = cents % 100;

  return `R$ ${reais},${remainingCents.toString().padStart(2, "0")}`;
}

export function ServiceCard({
  name,
  durationMinutes,
  priceCents,
  selected = false,
  onPress,
  testID,
}: ServiceCardProps) {
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center justify-between rounded-[20px] p-4 ${selected ? "bg-primary-50 border-[1.5px] border-primary-400" : "bg-neutral-50"}`}
      onPress={onPress}
      testID={testID}
    >
      <View className="flex-row items-center gap-2">
        <Scissors color={colors.neutral[600]} size={16} />
        <View>
          <Text className="text-base font-sans-semibold text-ink">{name}</Text>
          <View className="flex-row items-center gap-1">
            <Clock color={colors.neutral[500]} size={14} />
            <Text
              className="text-xs font-sans text-neutral-500"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {durationMinutes} min
            </Text>
          </View>
        </View>
      </View>
      <Text
        className="text-xl font-display-bold text-primary-600"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatPriceBRL(priceCents)}
      </Text>
    </Pressable>
  );
}
