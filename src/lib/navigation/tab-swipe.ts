type NestedState = { index?: number; routes: { name: string }[] };

export function nestedRouteName(route: unknown) {
  const state = (route as { state?: NestedState }).state;

  return state?.routes[state.index ?? 0]?.name;
}

// The book date step hosts MonthCalendar, which needs horizontal drags for itself.
export function isTabSwipeEnabled(routeName: string, nestedName?: string) {
  return !(routeName === "book" && nestedName === "date");
}
