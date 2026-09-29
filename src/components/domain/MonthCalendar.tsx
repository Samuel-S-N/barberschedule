import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import { useLanguage } from "../../i18n/use-language";
import { addLocalDays } from "../../lib/dates/calendar-strip-days";
import { BOOKING_DAYS_AHEAD, addMonths, buildMonthGrid, isDateBookable } from "../../lib/dates/month-calendar";
import { colors } from "../../lib/design/colors";
import { formatDateLabel } from "../../lib/i18n/format";

export type MonthCalendarProps = {
  maxDaysAhead?: number;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  testID?: string;
  today: string;
};

export function MonthCalendar({ maxDaysAhead = BOOKING_DAYS_AHEAD, onSelectDate, selectedDate, testID, today }: MonthCalendarProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const currentMonth = today.slice(0, 7);
  const lastMonth = addLocalDays(today, maxDaysAhead).slice(0, 7);
  const [pickedMonth, setMonth] = useState(currentMonth);
  const month = pickedMonth < currentMonth ? currentMonth : pickedMonth;
  const grid = buildMonthGrid(month, language);
  const canGoBack = month > currentMonth;
  const canGoForward = month < lastMonth;

  return (
    <View className="w-full max-w-[420px] gap-2" testID={testID}>
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel={t("common.previousMonth")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoBack }}
          className={`h-10 w-10 items-center justify-center rounded-full ${canGoBack ? "" : "opacity-30"}`}
          disabled={!canGoBack}
          onPress={() => setMonth(addMonths(month, -1))}
          testID="month-calendar-prev"
        >
          <ChevronLeft color={colors.ink} size={20} />
        </Pressable>
        <Text accessibilityRole="header" className="text-base font-sans-semibold text-ink" testID="month-calendar-title">
          {grid.label}
        </Text>
        <Pressable
          accessibilityLabel={t("common.nextMonth")}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoForward }}
          className={`h-10 w-10 items-center justify-center rounded-full ${canGoForward ? "" : "opacity-30"}`}
          disabled={!canGoForward}
          onPress={() => setMonth(addMonths(month, 1))}
          testID="month-calendar-next"
        >
          <ChevronRight color={colors.ink} size={20} />
        </Pressable>
      </View>
      <View className="flex-row">
        {grid.weekdayLabels.map((label, index) => (
          <Text className="mx-0.5 flex-1 text-center text-xs font-sans-medium text-neutral-500" key={index}>
            {label}
          </Text>
        ))}
      </View>
      {grid.weeks.map((week, weekIndex) => (
        <View className="flex-row" key={weekIndex}>
          {week.map((date, dayIndex) => {
            if (!date) return <View className="m-0.5 aspect-square flex-1" key={dayIndex} />;

            const bookable = isDateBookable(date, today, maxDaysAhead);
            const selected = date === selectedDate;

            return (
              <Pressable
                accessibilityLabel={formatDateLabel(date, language)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !bookable, selected }}
                className={`m-0.5 aspect-square flex-1 items-center justify-center rounded-2xl ${selected ? "bg-ink" : "bg-transparent"}`}
                disabled={!bookable}
                key={date}
                onPress={() => onSelectDate(date)}
                testID={`month-calendar-day-${date}`}
              >
                <Text
                  className={`text-base font-sans-semibold ${selected ? "text-white" : bookable ? "text-ink" : "text-neutral-300"}`}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {Number(date.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
