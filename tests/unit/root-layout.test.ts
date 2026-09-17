import React from "react";
import { render } from "@testing-library/react-native";

// The mocked Stack must be created *inside* the jest.mock() factory, not
// captured from an outer `const`. Plain `import` statements (including the
// one below that pulls in app/_layout, which itself requires "expo-router")
// are hoisted above every other top-level statement by the ESM->CJS
// transform, ahead of any `const` in this file, regardless of source order.
// A `const` referenced by the factory would still be uninitialized the
// first time the factory actually runs.
jest.mock("expo-font", () => ({ useFonts: jest.fn() }));
jest.mock("expo-router", () => ({
  Stack: jest.fn(() => null),
  useRouter: () => ({ replace: jest.fn() }),
  useSegments: () => [],
}));
jest.mock("../../src/features/auth/session", () => ({
  resolveAuthRedirect: jest.fn(() => null),
}));
jest.mock("../../src/providers/AppProviders", () => ({
  useSupabaseSession: jest.fn(),
}));

import { useFonts } from "expo-font";
import { Stack as MockedStack } from "expo-router";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { RootNavigator } from "../../app/_layout";

const mockedUseFonts = jest.mocked(useFonts);
const mockedUseSupabaseSession = jest.mocked(useSupabaseSession);
const mockedStack = jest.mocked(MockedStack);

describe("RootNavigator font gate", () => {
  beforeEach(() => {
    mockedStack.mockClear();
  });

  it("shows the loading view when fonts have not finished loading", async () => {
    mockedUseFonts.mockReturnValue([false, null] as never);
    mockedUseSupabaseSession.mockReturnValue({
      isLoading: false, profile: null, session: null, supabase: {} as never,
    });

    await render(React.createElement(RootNavigator));

    expect(mockedStack).not.toHaveBeenCalled();
  });

  it("shows the loading view when auth is loading, even if fonts are ready", async () => {
    mockedUseFonts.mockReturnValue([true, null] as never);
    mockedUseSupabaseSession.mockReturnValue({
      isLoading: true, profile: null, session: null, supabase: {} as never,
    });

    await render(React.createElement(RootNavigator));

    expect(mockedStack).not.toHaveBeenCalled();
  });

  it("renders the stack once both auth and fonts are ready", async () => {
    mockedUseFonts.mockReturnValue([true, null] as never);
    mockedUseSupabaseSession.mockReturnValue({
      isLoading: false, profile: null, session: null, supabase: {} as never,
    });

    await render(React.createElement(RootNavigator));

    expect(mockedStack).toHaveBeenCalled();
  });
});
