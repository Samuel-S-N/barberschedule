import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { colors } from "../../lib/design/colors";

export type ScreenHeaderProps = { title: string; onBack: () => void; backLabel: string; testID?: string };

export function ScreenHeader({ title, onBack, backLabel, testID }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center gap-2" testID={testID}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        className="min-h-[44px] min-w-[44px] items-center justify-center"
        hitSlop={8}
        onPress={onBack}
        testID="back"
      >
        <ChevronLeft color={colors.ink} size={26} />
      </Pressable>
      <Text accessibilityRole="header" className="text-2xl font-display-bold text-ink">{title}</Text>
    </View>
  );
}
