import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { BOOKING_STEPS, stepHref, stepNumber } from "../../features/booking/steps";
import type { BookingIds, BookingStep } from "../../features/booking/steps";
import { StepBar } from "./StepBar";

export function StepIndicator({ current, ids }: { current: BookingStep; ids: BookingIds }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <StepBar
      canSelect={(key) => stepHref(key as BookingStep, ids) !== null}
      currentKey={current}
      label={t("book.stepOf", { current: stepNumber(current), name: t(`book.steps.${current}`), total: BOOKING_STEPS.length })}
      onSelect={(key) => {
        const href = stepHref(key as BookingStep, ids);

        if (href) router.dismissTo(href as never);
      }}
      steps={BOOKING_STEPS.map((step) => ({ key: step, label: t(`book.steps.${step}`) }))}
    />
  );
}
