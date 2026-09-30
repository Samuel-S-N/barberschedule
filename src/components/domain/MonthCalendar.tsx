import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { useLanguage } from "../../i18n/use-language";
import type { Language } from "../../i18n/language";
import { rubberBand, settleIndex, SWIPE_CLAIM_PX, SWIPE_FAIL_Y_PX } from "../../lib/gestures/swipe";
import { addLocalDays } from "../../lib/dates/calendar-strip-days";
import { BOOKING_DAYS_AHEAD, buildMonthGrid, isDateBookable, monthRange } from "../../lib/dates/month-calendar";
import { colors } from "../../lib/design/colors";
import { formatDateLabel } from "../../lib/i18n/format";

const SETTLE_MS = 220;

export type MonthCalendarProps = {
  maxDaysAhead?: number;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  testID?: string;
  today: string;
};

type MonthGridProps = Pick<MonthCalendarProps, "onSelectDate" | "selectedDate" | "today"> & {
  language: Language;
  maxDaysAhead: number;
  month: string;
};

function MonthGrid({ language, maxDaysAhead, month, onSelectDate, selectedDate, today }: MonthGridProps) {
  const grid = buildMonthGrid(month, language);

  return (
    <View className="gap-2">
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

export function MonthCalendar({ maxDaysAhead = BOOKING_DAYS_AHEAD, onSelectDate, selectedDate, testID, today }: MonthCalendarProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const firstMonth = today.slice(0, 7);
  const lastMonth = addLocalDays(today, maxDaysAhead).slice(0, 7);
  const months = monthRange(firstMonth, lastMonth);
  const pages = months.length;
  const [pickedMonth, setPickedMonth] = useState(firstMonth);
  const index = pickedMonth <= firstMonth ? 0 : pickedMonth >= lastMonth ? pages - 1 : months.indexOf(pickedMonth);
  const canGoBack = index > 0;
  const canGoForward = index < pages - 1;
  const [width, setWidth] = useState(0);
  // The months sit side by side in a strip; `position` is its translateX (0 on the first month, -width on the second).
  // It lives on the UI thread so the strip follows the finger without waiting for JS.
  const position = useSharedValue(0);
  const origin = useSharedValue(0);
  const grab = useSharedValue(0);

  // Re-seat the strip without animation when it is first measured, resized, or the window's first month moves on.
  useEffect(() => {
    position.value = 0 - index * width;
  }, [width, firstMonth]);

  const goTo = (target: number) => {
    position.value = withTiming(0 - target * width, { duration: SETTLE_MS });
    setPickedMonth(months[target]);
  };

  // A native gesture on purpose: inside the Android pager (react-native-pager-view) a JS responder is
  // cancelled after ~8 dp, because the pager announces a native gesture as soon as the touch passes the slop.
  const swipe = Gesture.Pan()
    .withTestId("month-swipe")
    .enabled(width > 0 && pages > 1)
    .activeOffsetX([-SWIPE_CLAIM_PX, SWIPE_CLAIM_PX])
    .failOffsetY([-SWIPE_FAIL_Y_PX, SWIPE_FAIL_Y_PX])
    .onStart((event) => {
      origin.value = position.value;
      // The claim distance is already in translationX; start from it so the strip does not jump.
      grab.value = event.translationX;
    })
    .onUpdate((event) => {
      position.value = rubberBand(origin.value + event.translationX - grab.value, width, pages);
    })
    .onEnd((event, success) => {
      const target = success ? settleIndex(index, position.value, event.velocityX, width, pages) : index;

      position.value = withTiming(0 - target * width, { duration: SETTLE_MS });
      if (target !== index) runOnJS(setPickedMonth)(months[target]);
    });

  const stripStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value }] }));
  const gridProps = { language, maxDaysAhead, onSelectDate, selectedDate, today };

  return (
    // pan-y keeps vertical page scrolling on touch browsers; gesture-handler defaults to `touch-action: none` on web.
    <GestureDetector gesture={swipe} touchAction="pan-y">
      <View className="w-full max-w-[420px] select-none gap-2" testID={testID ?? "month-calendar"}>
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityLabel={t("common.previousMonth")}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoBack }}
            className={`h-10 w-10 items-center justify-center rounded-full ${canGoBack ? "" : "opacity-30"}`}
            disabled={!canGoBack}
            onPress={() => goTo(index - 1)}
            testID="month-calendar-prev"
          >
            <ChevronLeft color={colors.ink} size={20} />
          </Pressable>
          <Text accessibilityRole="header" className="text-base font-sans-semibold text-ink" testID="month-calendar-title">
            {buildMonthGrid(months[index], language).label}
          </Text>
          <Pressable
            accessibilityLabel={t("common.nextMonth")}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGoForward }}
            className={`h-10 w-10 items-center justify-center rounded-full ${canGoForward ? "" : "opacity-30"}`}
            disabled={!canGoForward}
            onPress={() => goTo(index + 1)}
            testID="month-calendar-next"
          >
            <ChevronRight color={colors.ink} size={20} />
          </Pressable>
        </View>
        <View className="overflow-hidden" onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} testID="month-calendar-viewport">
          {width > 0 ? (
            <Animated.View style={[{ flexDirection: "row", width: width * pages }, stripStyle]} testID="month-pages">
              {months.map((month, pageIndex) => (
                <View
                  accessibilityElementsHidden={pageIndex !== index}
                  importantForAccessibility={pageIndex === index ? "auto" : "no-hide-descendants"}
                  key={month}
                  pointerEvents={pageIndex === index ? "auto" : "none"}
                  style={{ width }}
                >
                  <MonthGrid month={month} {...gridProps} />
                </View>
              ))}
            </Animated.View>
          ) : (
            <MonthGrid month={months[index]} {...gridProps} />
          )}
        </View>
      </View>
    </GestureDetector>
  );
}
