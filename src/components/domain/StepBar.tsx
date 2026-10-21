import { Pressable, Text, View } from "react-native";

export type StepBarProps = {
  canSelect?: (key: string) => boolean;
  currentKey: string;
  label: string;
  onSelect?: (key: string) => void;
  steps: { key: string; label: string }[];
};

// Slim progress segments + one label line. Completed segments can lead back when `canSelect` allows it.
export function StepBar({ canSelect, currentKey, label, onSelect, steps }: StepBarProps) {
  const position = steps.findIndex((step) => step.key === currentKey) + 1;

  return (
    <View className="w-full max-w-[420px] gap-1" testID="step-indicator">
      <View className="flex-row gap-1.5">
        {steps.map((step, index) => {
          const number = index + 1;
          const color = number < position ? "bg-primary-400" : number === position ? "bg-primary-600" : "bg-neutral-200";
          const enabled = number < position && Boolean(onSelect) && (canSelect ? canSelect(step.key) : true);

          return (
            <Pressable
              accessibilityLabel={step.label}
              accessibilityRole={enabled ? "button" : "text"}
              className="flex-1 justify-center py-2"
              disabled={!enabled}
              key={step.key}
              onPress={() => onSelect?.(step.key)}
              testID={`step-${step.key}`}
            >
              <View className={`h-1.5 rounded-full ${color}`} />
            </Pressable>
          );
        })}
      </View>
      <Text className="text-sm font-sans-medium text-neutral-600" style={{ fontVariant: ["tabular-nums"] }} testID="step-label">{label}</Text>
    </View>
  );
}
