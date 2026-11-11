import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import type { ThemeInput } from "../../lib/design/theme/derive";
import { AppThemeProvider } from "../../lib/design/theme/ThemeProvider";
import { useSupabaseSession } from "../../providers/AppProviders";
import { getShopTheme, readCachedTheme, writeCachedTheme } from "./theme";

// The current shop's colours (single-shop MVP). `isReady` is false only while a signed-in user has neither a cached
// theme nor an answer yet, so the root can keep its loading screen instead of flashing the default colours.
export function useShopTheme() {
  const { session, supabase } = useSupabaseSession();
  const userId = session?.user.id ?? null;
  const [cache, setCache] = useState<{ loaded: boolean; value: ThemeInput | null }>({ loaded: false, value: null });
  const query = useQuery({ enabled: Boolean(userId), queryFn: () => getShopTheme(supabase), queryKey: ["shop-theme", userId] });

  useEffect(() => {
    let active = true;

    setCache({ loaded: !userId, value: null });
    if (userId) {
      void readCachedTheme(userId).then((value) => {
        if (active) setCache({ loaded: true, value });
      });
    }

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (userId && query.data) void writeCachedTheme(userId, query.data.input);
  }, [query.data, userId]);

  const answered = query.isSuccess || query.isError;

  return {
    data: query.data,
    input: query.data ? query.data.input : answered ? null : cache.value,
    isReady: !userId || answered || (cache.loaded && cache.value !== null),
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
