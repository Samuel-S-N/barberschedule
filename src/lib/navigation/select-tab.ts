type TabState = { routes: { key: string; name: string }[] };

// The tab bar callbacks navigate by route key, while the bar items are keyed by route name.
export function selectTab(state: TabState, navigateToTab: (routeKey: string) => void, name: string) {
  const route = state.routes.find((candidate) => candidate.name === name);
  if (route) navigateToTab(route.key);
}
