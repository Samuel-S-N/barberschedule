import { useState } from "react";

import { useUnavailableDates } from "./use-unavailable-dates";

// The selection of a booking calendar and whether Continue is allowed, for every flow. If the day the step opens on (today, usually)
// turns out to be one the professional cannot work, nothing is selected and Continue waits until the person taps a free day: the app
// never picks another day for them. While the unavailable days load, the opening day stays selected (no flash); a day the person
// picked is never cleared again, whatever the data does.
export function useAvailabilitySelection(professionalId: string | undefined, localDate: string, onChange: (date: string) => void) {
  const [month, setMonth] = useState(localDate.slice(0, 7));
  const [picked, setPicked] = useState(false);
  const unavailableDates = useUnavailableDates(professionalId ?? "", month);
  const blocked = !picked && unavailableDates.includes(localDate);

  return {
    calendar: {
      onSelectDate: (date: string) => {
        setPicked(true);
        onChange(date);
      },
      onVisibleMonthChange: setMonth,
      selectedDate: blocked ? "" : localDate,
      unavailableDates,
    },
    canContinue: !blocked,
  };
}
