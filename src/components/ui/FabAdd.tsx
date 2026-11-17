import { Plus } from "lucide-react-native";
import { Pressable } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";
import { shadows } from "../../lib/design/shadows";

// Circular "+" button pinned to the bottom-right of a screen (render it as a child of the screen root, outside the scroll view).
export function FabAdd({ label, onPress, testID = "fab-add" }: { label: string; onPress: () => void; testID?: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      className="absolute bottom-6 right-5 h-14 w-14 items-center justify-center rounded-full bg-accent"
      onPress={onPress}
      style={shadows.level2}
      testID={testID}
    >
      <Plus color={colors.onAccent} size={28} />
    </Pressable>
  );
}
