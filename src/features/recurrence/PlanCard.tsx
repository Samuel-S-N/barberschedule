import { Pressable } from "react-native";

import { Card } from "../../components/ui/Card";
import { PlanSummary } from "./PlanSummary";

export function PlanCard({ amountText, caption, normalText, onPress, periodicity, testID, title }: { amountText: string; caption: string; normalText: string; onPress: () => void; periodicity: string; testID: string; title: string }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      <Card variant="outlined">
        <PlanSummary amountText={amountText} caption={caption} normalText={normalText} periodicity={periodicity} title={title} />
      </Card>
    </Pressable>
  );
}
