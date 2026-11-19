type TabState = { index: number; routes: { key: string; name: string }[] };
type TabPressEmitter = { emit: (event: { canPreventDefault: true; target: string; type: "tabPress" }) => { defaultPrevented: boolean } };

// A custom tab bar must do what the stock bars do (BottomTabBar.js / MaterialTopTabBar.js in expo-router): emit `tabPress` first. A
// nested stack inside the tab listens for it and pops to its root when its tab is pressed while already focused. Never call
// preventDefault() on the event: that cancels the pop. The bar items are keyed by route name, navigation by route key.
// `keepNested` lists tabs whose nested stack must NOT pop when the tab is pressed while focused (the customer's Book flow keeps a
// half-made booking). They skip the event instead of preventing it: a prevented press would also stop the tab from opening.
export function selectTab(
  { emitter, navigateToTab, state }: { emitter: TabPressEmitter; navigateToTab: (routeKey: string) => void; state: TabState },
  name: string,
  keepNested: readonly string[] = [],
) {
  const route = state.routes.find((candidate) => candidate.name === name);

  if (!route) return;
  const focused = route.key === state.routes[state.index]?.key;

  if (keepNested.includes(name)) {
    if (!focused) navigateToTab(route.key);

    return;
  }
  const event = emitter.emit({ canPreventDefault: true, target: route.key, type: "tabPress" });

  // Like the stock bar: the focused tab is not navigated to again, and a prevented press does not navigate.
  if (!focused && !event.defaultPrevented) navigateToTab(route.key);
}
