import { useCallback, useRef } from "react";
import { Pressable, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Motion } from "../../lib/design/motion";

export type ButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  testID?: string;
};

const VARIANT_CLASSNAME: Record<ButtonVariant, string> = {
  primary: "bg-primary-400",
  dark: "bg-ink",
  outline: "bg-transparent border border-neutral-200",
  ghost: "bg-transparent",
  danger: "bg-danger-500",
};

const VARIANT_TEXT_CLASSNAME: Record<ButtonVariant, string> = {
  primary: "text-ink",
  dark: "text-white",
  outline: "text-neutral-800",
  ghost: "text-primary-600",
  danger: "text-white",
};

const SIZE_CLASSNAME: Record<ButtonSize, string> = {
  sm: "h-button-height-sm",
  md: "h-button-height",
  lg: "h-button-height-lg",
};

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  testID,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.97, { duration: Motion.duration.fast });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: Motion.duration.fast });
  }, [scale]);

  const handlePress = useCallback(() => {
    if (!disabledRef.current) {
      onPress();
    }
  }, [onPress]);

  // The scale lives on an outer Animated.View: Reanimated's animated components drop
  // NativeWind className styles on web, so the classed Pressable/Text are plain RN.
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className={`flex-row items-center justify-center rounded-full px-6 min-w-[44px] ${SIZE_CLASSNAME[size]} ${VARIANT_CLASSNAME[variant]} ${disabled ? "opacity-50" : ""}`}
        disabled={disabled}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={testID}
      >
        <Text className={`font-sans-semibold text-base ${VARIANT_TEXT_CLASSNAME[variant]}`}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
