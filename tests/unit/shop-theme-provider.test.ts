import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: jest.fn() }));
jest.mock("../../src/features/shops/theme", () => ({
  getShopTheme: jest.fn(),
  readCachedTheme: jest.fn(),
  writeCachedTheme: jest.fn(),
}));

import { getShopTheme, readCachedTheme, writeCachedTheme } from "../../src/features/shops/theme";
import { ShopThemeProvider, THEME_WAIT_MS } from "../../src/features/shops/ShopThemeProvider";
import { DEFAULT_COLORS } from "../../src/lib/design/colors";
import { deriveTheme } from "../../src/lib/design/theme/derive";
import { useColors } from "../../src/lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../src/providers/AppProviders";

const session = jest.mocked(useSupabaseSession);
const fetchTheme = jest.mocked(getShopTheme);
const cached = jest.mocked(readCachedTheme);
const saved = jest.mocked(writeCachedTheme);

type Colors = typeof DEFAULT_COLORS;

function Probe({ onColors }: { onColors: (colors: Colors) => void }) {
  onColors(useColors());

  return null;
}

async function renderProvider(onColors: (colors: Colors) => void, queries: { retry?: number | boolean } = { retry: false }) {
  // gcTime 0: react-query's default 5-minute GC timer would keep the Jest process alive after the tests finish.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, ...queries } } });

  return render(
    React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(ShopThemeProvider, null, React.createElement(Probe, { onColors })),
    ),
  );
}

const signedIn = () => session.mockReturnValue({ isLoading: false, profile: { userId: "u1" }, session: { user: { id: "u1" } }, supabase: {} } as never);

describe("ShopThemeProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cached.mockResolvedValue(null);
  });

  it("shows the default theme and does not fetch without a session", async () => {
    session.mockReturnValue({ isLoading: false, profile: null, session: null, supabase: {} } as never);
    const seen: Colors[] = [];

    await renderProvider((colors) => seen.push(colors));

    expect(seen[0]).toBe(DEFAULT_COLORS);
    expect(fetchTheme).not.toHaveBeenCalled();
  });

  it("applies the shop colours after sign-in and caches them for the next launch", async () => {
    signedIn();
    fetchTheme.mockResolvedValue({ input: { accent: null, base: null, primary: "#2F6FDB" }, shopId: "s1" });
    const seen: Colors[] = [];

    await renderProvider((colors) => seen.push(colors));

    await waitFor(() => expect(seen[seen.length - 1].primary[400]).toBe(deriveTheme({ primary: "#2F6FDB" }).colors.primary[400]));
    expect(saved).toHaveBeenCalledWith("u1", { accent: null, base: null, primary: "#2F6FDB" });
  });

  it("starts from the cached colours while the request is still running", async () => {
    signedIn();
    cached.mockResolvedValue({ accent: null, base: null, primary: "#7A1F2B" });
    fetchTheme.mockReturnValue(new Promise(() => undefined));
    const seen: Colors[] = [];

    await renderProvider((colors) => seen.push(colors));

    await waitFor(() => expect(seen[seen.length - 1].primary[400]).toBe("#7A1F2B"));
  });

  it("falls back to the default theme when the request fails", async () => {
    signedIn();
    fetchTheme.mockRejectedValue(new Error("offline"));
    const seen: Colors[] = [];

    await renderProvider((colors) => seen.push(colors));

    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[seen.length - 1]).toBe(DEFAULT_COLORS);
  });

  it("does not hold the app behind the spinner while a failed request would be retried with backoff", async () => {
    signedIn();
    fetchTheme.mockRejectedValue(new Error("offline"));
    const seen: Colors[] = [];

    // The app's QueryClient keeps react-query's default retry (3 with growing delays): the theme query must opt out.
    await renderProvider((colors) => seen.push(colors), {});

    await waitFor(() => expect(seen.length).toBeGreaterThan(0), { timeout: 900 });
    expect(fetchTheme).toHaveBeenCalledTimes(1);
  });

  it("opens the app with the default theme when the request hangs", async () => {
    jest.useFakeTimers();
    try {
      signedIn();
      fetchTheme.mockReturnValue(new Promise(() => undefined));
      const seen: Colors[] = [];

      await renderProvider((colors) => seen.push(colors));
      expect(seen).toHaveLength(0);

      await act(async () => {
        jest.advanceTimersByTime(THEME_WAIT_MS);
      });

      expect(seen[seen.length - 1]).toBe(DEFAULT_COLORS);
    } finally {
      jest.useRealTimers();
    }
  });
});
