import { MonthCalendar } from "../../components/domain/MonthCalendar";
import type { useAvailabilitySelection } from "./use-availability-selection";

// The booking calendar of every flow: MonthCalendar driven by useAvailabilitySelection (the days the chosen professional cannot work
// are dimmed; the selection and the Continue button come from the same hook, see there).
export function AvailabilityCalendar({ selection, today }: { selection: ReturnType<typeof useAvailabilitySelection>; today: string }) {
  return <MonthCalendar {...selection.calendar} today={today} />;
}
