import { Text, View } from "react-native";

import { shadows } from "../../lib/design/shadows";

export type StatTileProps = {
  label: string;
  value: string;
  sublabel?: string;
  testID?: string;
};

export function StatTile({ label, value, sublabel, testID }: StatTileProps) {
  return (
    <View
      accessibilityLabel={sublabel ? `${label}: ${value}, ${sublabel}` : `${label}: ${value}`}
      accessible
      className="min-w-[140px] flex-1 gap-1 rounded-[20px] bg-surface p-4"
      style={shadows.level1}
      testID={testID}
    >
      <Text className="text-sm font-sans-medium text-neutral-600">{label}</Text>
      <Text className="text-2xl font-display-bold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {sublabel ? <Text className="text-xs font-sans text-neutral-500">{sublabel}</Text> : null}
    </View>
  );
}
