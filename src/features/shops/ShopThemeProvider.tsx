import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { ThemeInput } from "../../lib/design/theme/derive";
import { AppThemeProvider } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "./CurrentShopProvider";
import { getShopTheme, readCachedTheme, writeCachedTheme } from "./theme";

// Longest the root keeps its loading screen for the shop colours: they are cosmetic, so a slow or failing request must
// never hold the whole app back.
export const THEME_WAIT_MS = 2500;

// The current shop's colours, available to signed-out visitors too (the shop comes from the host). `isReady` is false only
// while the shop has neither a cached theme nor an answer yet, so the root can keep its loading screen instead of flashing
// the default colours, and only for THEME_WAIT_MS at most.
export function useShopTheme() {
  const { supabase } = useSupabaseSession();
  const { slug } = useCurrentShop();
  const [cache, setCache] = useState<{ loaded: boolean; value: ThemeInput | null }>({ loaded: false, value: null });
  const [timedOut, setTimedOut] = useState(false);
  // No retry: react-query's default (3 tries with growing delays, ~7 s) would keep the app behind the spinner.
  const query = useQuery({ enabled: Boolean(slug), queryFn: () => getShopTheme(supabase, slug!), queryKey: ["shop-theme", slug], retry: false });

  useEffect(() => {
    let active = true;

    setCache({ loaded: !slug, value: null });
    if (slug) {
      void readCachedTheme(slug).then((value) => {
        if (active) setCache({ loaded: true, value });
      });
    }

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (slug && query.data) void writeCachedTheme(slug, query.data.input);
  }, [query.data, slug]);

  useEffect(() => {
    setTimedOut(false);
    if (!slug) return undefined;
    const timer = setTimeout(() => setTimedOut(true), THEME_WAIT_MS);

    return () => clearTimeout(timer);
  }, [slug]);

  const answered = query.isSuccess || query.isError;

  return {
    data: query.data,
    input: query.data ? query.data.input : answered ? null : cache.value,
    isReady: !slug || answered || timedOut || (cache.loaded && cache.value !== null),
  };
}

export function ShopThemeProvider({ children }: PropsWithChildren) {
  const { input, isReady } = useShopTheme();

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return <AppThemeProvider input={input}>{children}</AppThemeProvider>;
}

const styles = StyleSheet.create({ loading: { alignItems: "center", flex: 1, justifyContent: "center" } });
