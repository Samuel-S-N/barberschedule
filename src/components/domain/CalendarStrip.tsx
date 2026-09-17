import { Pressable, ScrollView, Text, View } from "react-native";

export type CalendarStripDay = {
  date: string;
  weekdayLabel: string;
  dayNumber: string;
  hasAppointment?: boolean;
};

export type CalendarStripProps = {
  days: CalendarStripDay[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  testID?: string;
};

export function CalendarStrip({ days, selectedDate, onSelectDate, testID }: CalendarStripProps) {
  return (
    <ScrollView className="flex-none" horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      <View className="flex-row gap-2 px-safe-horizontal">
        {days.map((day) => {
          const selected = day.date === selectedDate;

          return (
            <Pressable
              accessibilityLabel={`${day.weekdayLabel} ${day.dayNumber}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`h-16 w-14 items-center justify-center gap-1 rounded-2xl ${selected ? "bg-ink" : "bg-transparent"}`}
              key={day.date}
              onPress={() => onSelectDate(day.date)}
              testID={`calendar-strip-day-${day.date}`}
            >
              <Text className={`text-xs font-sans-medium ${selected ? "text-white" : "text-neutral-600"}`}>
                {day.weekdayLabel}
              </Text>
              <Text
                className={`text-base font-sans-semibold ${selected ? "text-white" : "text-neutral-600"}`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {day.dayNumber}
              </Text>
              {day.hasAppointment ? (
                <View
                  className="h-1.5 w-1.5 rounded-full bg-primary-400"
                  testID={`calendar-strip-day-${day.date}-dot`}
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
