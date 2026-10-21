import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { BOOKING_STEPS, stepHref, stepNumber } from "../../features/booking/steps";
import type { BookingIds, BookingStep } from "../../features/booking/steps";

export function StepIndicator({ current, ids }: { current: BookingStep; ids: BookingIds }) {
  const { t } = useTranslation();
  const router = useRouter();
  const position = stepNumber(current);

  return (
    <View className="w-full max-w-[420px] gap-1" testID="step-indicator">
      <View className="flex-row gap-1.5">
        {BOOKING_STEPS.map((step, index) => {
          const number = index + 1;
          const color = number < position ? "bg-primary-400" : number === position ? "bg-primary-600" : "bg-neutral-200";
          const href = number < position ? stepHref(step, ids) : null;

          return (
            <Pressable
              accessibilityLabel={t(`book.steps.${step}`)}
              accessibilityRole={href ? "button" : "text"}
              className="flex-1 justify-center py-2"
              disabled={!href}
              key={step}
              onPress={() => href && router.dismissTo(href as never)}
              testID={`step-${step}`}
            >
              <View className={`h-1.5 rounded-full ${color}`} />
            </Pressable>
          );
        })}
      </View>
      <Text className="text-sm font-sans-medium text-neutral-600" style={{ fontVariant: ["tabular-nums"] }} testID="step-label">
        {t("book.stepOf", { current: position, name: t(`book.steps.${current}`), total: BOOKING_STEPS.length })}
      </Text>
    </View>
  );
}
