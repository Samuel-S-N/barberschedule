import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// A bar pinned to the bottom of a screen for its main action(s); give the scroll content bottom padding so nothing hides behind it.
export function BottomActionBar({ children, testID = "plans-bottom-bar" }: { children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();

  return (
    <View className="absolute bottom-0 left-0 right-0 items-center border-t border-neutral-200 bg-surface px-5 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }} testID={testID}>
      <View className="w-full max-w-[420px] gap-2">{children}</View>
    </View>
  );
}
