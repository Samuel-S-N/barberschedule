import { Pressable, Text, View } from "react-native";

import { Card } from "../../components/ui/Card";

export function PlanCard({ normalText, onPress, priceText, testID, title }: { normalText: string; onPress: () => void; priceText: string; testID: string; title: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      <Card variant="outlined">
        <View className="gap-1">
          <Text className="text-base font-sans-semibold text-ink">{title}</Text>
          <Text className="text-sm font-sans-medium text-ink">{priceText}</Text>
          <Text className="text-xs font-sans text-neutral-600">{normalText}</Text>
        </View>
      </Card>
    </Pressable>
  );
}
