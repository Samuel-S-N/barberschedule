import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useLanguage } from "../../../i18n/use-language";
import { formatDateNumeric } from "../../../lib/i18n/format";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// One full-width row per weekday, Monday to Sunday. `dates` holds the next date of each weekday (the series' first date).
export function WeekdayList({ dates, disabledDays, onSelect, selectedDay }: { dates: Record<number, string>; disabledDays: number[]; onSelect: (day: number) => void; selectedDay: number | null }) {
  const { t } = useTranslation();
  const language = useLanguage();

  return (
    <View className="gap-2">
      {DAYS.map((day) => {
        const disabled = disabledDays.includes(day);
        const selected = selectedDay === day;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            className={`min-h-[56px] w-full flex-row items-center justify-between rounded-xl border px-4 ${selected ? "border-primary-400 bg-primary-50" : "border-neutral-200 bg-surface"} ${disabled ? "opacity-50" : ""}`}
            disabled={disabled}
            key={day}
            onPress={() => onSelect(day)}
            testID={`weekday-${day}`}
          >
            <View>
              <Text className="text-base font-sans-semibold text-ink">{t(`owner.schedule.weekdays.${WEEKDAY_KEYS[day - 1]}`)}</Text>
              {disabled ? <Text className="text-xs font-sans text-neutral-600">{t("recurrence.noTimesWeekday")}</Text> : null}
            </View>
            <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(dates[day], language)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
