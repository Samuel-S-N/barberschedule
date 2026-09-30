// The book date step hosts MonthCalendar, which needs horizontal drags for itself.
export function isTabSwipeEnabled(pathname: string) {
  return pathname !== "/book/date";
}
