import React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

import { readPublicSupabaseConfig } from "../../src/lib/supabase/client";
import { AppProviders } from "../../src/providers/AppProviders";

describe("task 1 baseline", () => {
  it("runs the shared test setup", () => {
    expect(
      (
        globalThis as typeof globalThis & {
          __BARBERSCHEDULE_TEST_SETUP__?: boolean;
        }
      ).__BARBERSCHEDULE_TEST_SETUP__,
    ).toBe(true);
  });

  it("rejects missing public Supabase config", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(() => readPublicSupabaseConfig()).toThrow(
      "Missing EXPO_PUBLIC_SUPABASE_URL",
    );
  });

  it("renders children through the app providers", async () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    const { getByText } = await render(
      React.createElement(
        AppProviders,
        null,
        React.createElement(Text, null, "baseline child"),
      ),
    );

    expect(getByText("baseline child")).toBeTruthy();
  });
});
