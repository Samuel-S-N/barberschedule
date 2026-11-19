import { useState } from "react";

import { MonthCalendar } from "../../components/domain/MonthCalendar";
import type { MonthCalendarProps } from "../../components/domain/MonthCalendar";
import { useUnavailableDates } from "./use-unavailable-dates";

// The booking calendar of every flow: MonthCalendar, with the days the chosen professional cannot work dimmed (nothing is dimmed
// without a professional).
export function AvailabilityCalendar({ professionalId, ...rest }: Omit<MonthCalendarProps, "onVisibleMonthChange" | "unavailableDates"> & { professionalId?: string }) {
  const [month, setMonth] = useState(rest.selectedDate.slice(0, 7));
  const unavailableDates = useUnavailableDates(professionalId ?? "", month);

  return <MonthCalendar {...rest} onVisibleMonthChange={setMonth} unavailableDates={unavailableDates} />;
}
