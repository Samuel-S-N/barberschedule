import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { CalendarPopup } from "../domain/CalendarPopup";
import { useLanguage } from "../../i18n/use-language";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { stepDate } from "../../lib/dates/step-date";
import type { StepUnit } from "../../lib/dates/step-date";
import { formatDateNumeric } from "../../lib/i18n/format";

export type DateFieldProps = {
  disabledDates?: readonly string[];
  label: string;
  max?: string;
  min?: string;
  onChange: (date: string) => void;
  step?: StepUnit;
  testID: string;
  value: string;
};

const PREVIOUS = { day: "dateField.previousDay", month: "dateField.previousMonth", week: "dateField.previousWeek" } as const;
const NEXT = { day: "dateField.nextDay", month: "dateField.nextMonth", week: "dateField.nextWeek" } as const;

// `‹ 15/10/2026 ›`: the arrows move one step (a day, a week or a month) and never open anything; tapping the date opens a calendar.
export function DateField({ disabledDates, label, max, min, onChange, step = "day", testID, value }: DateFieldProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const previous = stepDate(value, step, -1);
  const next = stepDate(value, step, 1);
  const canGoBack = !min || previous >= min;
  const canGoForward = !max || next <= max;
  const arrow = "h-input-height w-11 items-center justify-center rounded-xl border border-neutral-200 bg-surface";

  return (
    <View className="gap-1">
      <Text className="text-sm font-sans-medium text-neutral-700">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Pressable accessibilityLabel={t(PREVIOUS[step])} accessibilityRole="button" accessibilityState={{ disabled: !canGoBack }} className={`${arrow} ${canGoBack ? "" : "opacity-30"}`} disabled={!canGoBack} onPress={() => onChange(previous)} testID={`${testID}-prev`}>
          <ChevronLeft color={colors.ink} size={20} />
        </Pressable>
        <Pressable accessibilityLabel={`${label}: ${formatDateNumeric(value, language)}. ${t("dateField.choose")}`} accessibilityRole="button" className="h-input-height flex-1 items-center justify-center rounded-xl border border-neutral-200 bg-surface px-4" onPress={() => setOpen(true)} testID={testID}>
          <Text className="text-base font-sans-semibold text-ink" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(value, language)}</Text>
        </Pressable>
        <Pressable accessibilityLabel={t(NEXT[step])} accessibilityRole="button" accessibilityState={{ disabled: !canGoForward }} className={`${arrow} ${canGoForward ? "" : "opacity-30"}`} disabled={!canGoForward} onPress={() => onChange(next)} testID={`${testID}-next`}>
          <ChevronRight color={colors.ink} size={20} />
        </Pressable>
      </View>
      <CalendarPopup
        disabledDates={disabledDates}
        max={max}
        min={min}
        onClose={() => setOpen(false)}
        onSelect={(date) => {
          setOpen(false);
          onChange(date);
        }}
        title={label}
        value={value}
        visible={open}
      />
    </View>
  );
}
