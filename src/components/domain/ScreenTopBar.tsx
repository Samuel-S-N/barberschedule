import { Text, View } from "react-native";

import { NotificationBell } from "./NotificationBell";

// Top strip + title. Left and centre of the strip are reserved (a future function on the left, the app name in the
// centre); the bell stays at the right. The title sits below the strip.
export function ScreenTopBar({ title }: { title: string }) {
  return (
    <View className="w-full max-w-[420px]">
      <View className="h-11 flex-row items-center justify-between">
        <View className="w-11" />
        <View className="flex-1" />
        <NotificationBell />
      </View>
      <Text accessibilityRole="header" className="text-3xl leading-[44px] font-display-bold text-ink">{title}</Text>
    </View>
  );
}
