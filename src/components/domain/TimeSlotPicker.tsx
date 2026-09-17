import { useCallback } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Motion } from "../../lib/design/motion";

export type TimeSlotStatus = "free" | "selected" | "occupied";
export type TimeSlot = { time: string; status: TimeSlotStatus };

export type TimeSlotPickerProps = {
  slots: TimeSlot[];
  onSelectSlot: (time: string) => void;
  testID?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function Slot({ slot, onSelectSlot }: { slot: TimeSlot; onSelectSlot: (time: string) => void }) {
  const scale = useSharedValue(slot.status === "selected" ? 1.03 : 1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const occupied = slot.status === "occupied";
  const selected = slot.status === "selected";

  const handlePress = useCallback(() => {
    if (occupied) {
      return;
    }

    scale.value = withTiming(1.03, { duration: Motion.duration.fast });
    onSelectSlot(slot.time);
  }, [occupied, onSelectSlot, scale, slot.time]);

  const className = occupied
    ? "bg-neutral-100"
    : selected
      ? "border-[1.5px] border-primary-400 bg-primary-50"
      : "border border-neutral-200 bg-surface";
  const textClassName = occupied
    ? "text-neutral-300"
    : selected
      ? "text-primary-600 font-sans-bold"
      : "text-neutral-800 font-sans-medium";

  return (
    <AnimatedPressable
      accessibilityLabel={slot.time}
      accessibilityRole="button"
      accessibilityState={{ disabled: occupied, selected }}
      className={`h-slot-height min-w-[68px] items-center justify-center rounded-xl px-3 ${className}`}
      disabled={occupied}
      onPress={handlePress}
      style={animatedStyle}
      testID={`time-slot-${slot.time}`}
    >
      <Animated.Text className={`text-base ${textClassName}`} style={{ fontVariant: ["tabular-nums"] }}>
        {slot.time}
      </Animated.Text>
    </AnimatedPressable>
  );
}

export function TimeSlotPicker({ slots, onSelectSlot, testID }: TimeSlotPickerProps) {
  return (
    <View className="flex-row flex-wrap gap-2" testID={testID}>
      {slots.map((slot) => (
        <Slot key={slot.time} onSelectSlot={onSelectSlot} slot={slot} />
      ))}
    </View>
  );
}
