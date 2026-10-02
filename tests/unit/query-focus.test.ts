import { focusManager } from "@tanstack/react-query";
import type { AppStateStatus } from "react-native";

import { bindQueryFocusToAppState } from "../../src/lib/query-focus";

function fakeAppState() {
  let listener: ((state: AppStateStatus) => void) | null = null;
  const remove = jest.fn();

  return {
    appState: { addEventListener: (_: "change", fn: (state: AppStateStatus) => void) => { listener = fn; return { remove }; } },
    emit: (state: AppStateStatus) => listener?.(state),
    remove,
  };
}

describe("bindQueryFocusToAppState", () => {
  afterEach(() => focusManager.setFocused(undefined));

  it("marks the app focused only while it is active, so returning to it refetches stale data", () => {
    const fake = fakeAppState();
    const unbind = bindQueryFocusToAppState(fake.appState);

    fake.emit("background");
    expect(focusManager.isFocused()).toBe(false);
    fake.emit("active");
    expect(focusManager.isFocused()).toBe(true);

    unbind();
    expect(fake.remove).toHaveBeenCalledTimes(1);
  });
});
