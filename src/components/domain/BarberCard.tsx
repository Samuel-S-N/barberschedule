import { Pressable, Text, View } from "react-native";
import { MapPin, Star } from "lucide-react-native";

import { colors } from "../../lib/design/colors";

export type BarberCardProps = {
  name: string;
  specialty?: string;
  rating?: number;
  distanceKm?: number;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function BarberCard({
  name,
  specialty,
  rating,
  distanceKm,
  selected = false,
  onPress,
  testID,
}: BarberCardProps) {
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-3 rounded-[20px] border p-4 bg-surface ${selected ? "border-[1.5px] border-primary-400 bg-primary-50" : "border-neutral-200"}`}
      onPress={onPress}
      testID={testID}
    >
      <View className="h-14 w-14 rounded-full bg-mist" />
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-lg font-display-semibold text-ink">{name}</Text>
          {rating !== undefined ? (
            <View className="flex-row items-center gap-1">
              <Star color={colors.warning[400]} fill={colors.warning[400]} size={14} />
              <Text
                className="text-sm font-sans-semibold text-ink"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {rating}
              </Text>
            </View>
          ) : null}
        </View>
        {specialty ? <Text className="text-sm font-sans text-neutral-500">{specialty}</Text> : null}
        {distanceKm !== undefined ? (
          <View className="flex-row items-center gap-1">
            <MapPin color={colors.neutral[500]} size={14} />
            <Text className="text-sm font-sans text-neutral-500">{distanceKm} km</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
