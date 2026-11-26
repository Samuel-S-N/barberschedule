import { CheckCircle2, Circle } from "lucide-react-native";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import { useColors } from "../../lib/design/theme/ThemeProvider";

type Props = PropsWithChildren<{ done: boolean | null; hint: string; optionalLabel?: string; stepKey: string; title: string }>;

// One checklist step: a status mark, the title (and "Opcional" tag), a hint and the actions as children.
export function SetupStepCard({ children, done, hint, optionalLabel, stepKey, title }: Props) {
  const colors = useColors();

  return (
    <View className="gap-3 rounded-[20px] border border-neutral-200 bg-surface p-4" testID={`setup-step-${stepKey}`}>
      <View className="flex-row items-center gap-3">
        {done ? (
          <View testID={`setup-step-${stepKey}-done`}>
            <CheckCircle2 color={colors.primary[600]} size={22} />
          </View>
        ) : (
          <Circle color={colors.neutral[400]} size={22} />
        )}
        <Text className="flex-1 text-base font-sans-semibold text-ink">{title}</Text>
        {optionalLabel ? <Text className="text-xs font-sans-medium uppercase text-neutral-500">{optionalLabel}</Text> : null}
      </View>
      <Text className="text-sm font-sans text-neutral-600">{hint}</Text>
      {children}
    </View>
  );
}
