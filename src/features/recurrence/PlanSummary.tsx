import { Text, View } from "react-native";

// The plan as the customer reads it: title and periodicity on the left, the plan's value highlighted on the right,
// then how many sessions it covers and the regular price. Used by the plan card and by the review (checkout).
export function PlanSummary({ amountText, caption, normalText, periodicity, title }: { amountText: string; caption: string; normalText: string; periodicity: string; title: string }) {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-base font-sans-semibold text-ink">{title} <Text className="font-sans text-neutral-600">{periodicity}</Text></Text>
        <Text className="text-xl font-display-bold text-ink" style={{ fontVariant: ["tabular-nums"] }} testID="plan-amount">{amountText}</Text>
      </View>
      <Text className="text-sm font-sans text-neutral-700">{caption}</Text>
      <Text className="text-xs font-sans text-neutral-600">{normalText}</Text>
    </View>
  );
}
