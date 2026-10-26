import { Text, View } from "react-native";

// The plan as people read it: title (and periodicity) on the left, the plan's value highlighted on the right, then what the
// value covers and the regular price. Every part but the title is optional, so the staff cards can drop what they do not know.
// Used by the customer plan card and checkout, and by the barber and owner plan, request and series cards.
export function PlanSummary({ amountText, caption, normalText, periodicity, title }: { amountText?: string; caption?: string; normalText?: string; periodicity?: string; title: string }) {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="flex-1 text-base font-sans-semibold text-ink">{title}{periodicity ? <> <Text className="font-sans text-neutral-600">{periodicity}</Text></> : null}</Text>
        {amountText ? <Text className="text-xl font-display-bold text-ink" style={{ fontVariant: ["tabular-nums"] }} testID="plan-amount">{amountText}</Text> : null}
      </View>
      {caption ? <Text className="text-sm font-sans text-neutral-700">{caption}</Text> : null}
      {normalText ? <Text className="text-xs font-sans text-neutral-600">{normalText}</Text> : null}
    </View>
  );
}
