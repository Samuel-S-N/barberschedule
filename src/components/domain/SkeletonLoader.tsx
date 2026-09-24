import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

import { Motion } from "../../lib/design/motion";

function useShimmerStyle() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.5, { duration: Motion.duration.slower }), -1, true);
  }, [opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export type SkeletonBlockProps = { width: number; height: number; testID?: string };

export function SkeletonBlock({ width, height, testID }: SkeletonBlockProps) {
  const shimmerStyle = useShimmerStyle();

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height }, shimmerStyle]}
      testID={testID}
    >
      <View className="h-full w-full rounded-xl bg-neutral-100" />
    </Animated.View>
  );
}

export type SkeletonCircleProps = { size: number; testID?: string };

export function SkeletonCircle({ size, testID }: SkeletonCircleProps) {
  const shimmerStyle = useShimmerStyle();

  return (
    <Animated.View
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, borderRadius: size / 2 }, shimmerStyle]}
      testID={testID}
    >
      <View className="h-full w-full rounded-full bg-neutral-100" />
    </Animated.View>
  );
}

export type SkeletonTextProps = { lines?: number; width?: number; testID?: string };

export function SkeletonText({ lines = 1, width = 160, testID }: SkeletonTextProps) {
  return (
    <View className="gap-2" testID={testID}>
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonBlock
          height={12}
          key={index}
          testID={testID ? `${testID}-line-${index}` : `skeleton-text-line-${index}`}
          width={index === lines - 1 ? width * 0.6 : width}
        />
      ))}
    </View>
  );
}
