import { Pressable, Text, View } from "react-native";
import { Calendar, Clock, Scissors } from "lucide-react-native";

import { colors } from "../../lib/design/colors";
import { shadows } from "../../lib/design/shadows";
import { StatusBadge } from "./StatusBadge";
import type { AppointmentStatus } from "./StatusBadge";

export type AppointmentCardProps = {
  status: AppointmentStatus;
  serviceName: string;
  barberName: string;
  dateLabel: string;
  timeLabel: string;
  shopName: string;
  shopAddress?: string;
  onPress?: () => void;
  testID?: string;
};

export function AppointmentCard({
  status,
  serviceName,
  barberName,
  dateLabel,
  timeLabel,
  shopName,
  shopAddress,
  onPress,
  testID,
}: AppointmentCardProps) {
  const cancelled = status === "cancelled";
  const accessibilityLabel = `${serviceName} with ${barberName}, ${dateLabel} at ${timeLabel}, ${shopName}`;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="rounded-[20px] bg-surface p-4 gap-2"
      onPress={onPress}
      style={[shadows.level1, cancelled ? { opacity: 0.6 } : undefined]}
      testID={testID}
    >
      <View className="flex-row items-center justify-between">
        <StatusBadge status={status} />
      </View>
      <View className="flex-row items-center gap-1.5">
        <Scissors color={colors.neutral[600]} size={16} />
        <Text className="text-base font-sans-semibold text-ink">
          {serviceName} · {barberName}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        <Calendar color={colors.neutral[500]} size={16} />
        <Clock color={colors.neutral[500]} size={16} />
        <Text className="text-sm font-sans text-neutral-500" style={{ fontVariant: ["tabular-nums"] }}>
          {dateLabel} · {timeLabel}
        </Text>
      </View>
      <View className="h-px bg-neutral-200" />
      <Text className="text-sm font-sans text-neutral-500">
        {shopAddress ? `${shopName} · ${shopAddress}` : shopName}
      </Text>
    </Pressable>
  );
}
