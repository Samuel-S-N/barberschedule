import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, Text, View } from "react-native";

import { useLanguage } from "../../i18n/use-language";
import { useColors } from "../../lib/design/theme/ThemeProvider";
import { addMonths, buildMonthGrid } from "../../lib/dates/month-calendar";
import { formatDateLabel } from "../../lib/i18n/format";

export type CalendarPopupProps = {
  disabledDates?: readonly string[];
  max?: string;
  min?: string;
  onClose: () => void;
  onSelect: (date: string) => void;
  title: string;
  value: string;
  visible: boolean;
};

// A centred floating calendar (the project's pop-up style: X top-right, tap outside closes). Unlike the inline MonthCalendar it has
// no booking window: it shows any month between `min` and `max` (both optional), so it can also pick past dates.
export function CalendarPopup({ disabledDates = [], max, min, onClose, onSelect, title, value, visible }: CalendarPopupProps) {
  const colors = useColors();
  const { t } = useTranslation();
  const language = useLanguage();
  const [month, setMonth] = useState(value.slice(0, 7));

  // Every opening starts on the month of the current value.
  useEffect(() => {
    if (visible) setMonth(value.slice(0, 7));
  }, [visible, value]);

  if (!visible) return null;
  const grid = buildMonthGrid(month, language);
  const canGoBack = !min || addMonths(month, -1) >= min.slice(0, 7);
  const canGoForward = !max || addMonths(month, 1) <= max.slice(0, 7);
  const isEnabled = (date: string) => !(min && date < min) && !(max && date > max) && !disabledDates.includes(date);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <Pressable className="flex-1 items-center justify-center bg-black/40 p-5" onPress={onClose} testID="date-picker-backdrop">
        <Pressable className="w-full max-w-[360px] gap-3 rounded-2xl bg-surface p-5" onPress={() => undefined} testID="date-picker">
          <View className="flex-row items-start justify-between gap-2">
            <Text accessibilityRole="header" className="flex-1 text-xl font-display-semibold text-ink">{title}</Text>
            <Pressable accessibilityLabel={t("dateField.close")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={onClose} testID="date-picker-close">
              <X color={colors.ink} size={22} />
            </Pressable>
          </View>
          <View className="flex-row items-center justify-between">
            <Pressable
              accessibilityLabel={t("common.previousMonth")}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canGoBack }}
              className={`h-10 w-10 items-center justify-center rounded-full ${canGoBack ? "" : "opacity-30"}`}
              disabled={!canGoBack}
              onPress={() => setMonth(addMonths(month, -1))}
              testID="date-picker-prev"
            >
              <ChevronLeft color={colors.ink} size={20} />
            </Pressable>
            <Text accessibilityRole="header" className="text-base font-sans-semibold text-ink" testID="date-picker-title">{grid.label}</Text>
            <Pressable
              accessibilityLabel={t("common.nextMonth")}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canGoForward }}
              className={`h-10 w-10 items-center justify-center rounded-full ${canGoForward ? "" : "opacity-30"}`}
              disabled={!canGoForward}
              onPress={() => setMonth(addMonths(month, 1))}
              testID="date-picker-next"
            >
              <ChevronRight color={colors.ink} size={20} />
            </Pressable>
          </View>
          <View className="gap-2">
            <View className="flex-row">
              {grid.weekdayLabels.map((label, index) => (
                <Text className="mx-0.5 flex-1 text-center text-xs font-sans-medium text-neutral-500" key={index}>{label}</Text>
              ))}
            </View>
            {grid.weeks.map((week, weekIndex) => (
              <View className="flex-row" key={weekIndex}>
                {week.map((date, dayIndex) => {
                  if (!date) return <View className="m-0.5 aspect-square flex-1" key={dayIndex} />;
                  const enabled = isEnabled(date);
                  const selected = date === value;

                  return (
                    <Pressable
                      accessibilityLabel={formatDateLabel(date, language)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !enabled, selected }}
                      className={`m-0.5 aspect-square flex-1 items-center justify-center rounded-2xl ${selected ? "bg-ink" : "bg-transparent"}`}
                      disabled={!enabled}
                      key={date}
                      onPress={() => onSelect(date)}
                      testID={`date-picker-day-${date}`}
                    >
                      <Text className={`text-base font-sans-semibold ${selected ? "text-white" : enabled ? "text-ink" : "text-neutral-300"}`} style={{ fontVariant: ["tabular-nums"] }}>
                        {Number(date.slice(8))}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
