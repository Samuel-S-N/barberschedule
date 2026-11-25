import "../global.css";

import { DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import {
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from "@expo-google-fonts/oswald";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { resolveAuthRedirect } from "../src/features/auth/session";
import { usePendingLegal } from "../src/features/legal/use-pending-legal";
import { CurrentShopProvider } from "../src/features/shops/CurrentShopProvider";
import { NotificationsPromptGate } from "../src/features/notifications/NotificationsPromptGate";
import { ShopGate } from "../src/features/shops/ShopGate";
import { ShopThemeProvider } from "../src/features/shops/ShopThemeProvider";
import { useColors } from "../src/lib/design/theme/ThemeProvider";
import { AppProviders } from "../src/providers/AppProviders";
import { useSupabaseSession } from "../src/providers/AppProviders";

export function RootNavigator() {
  const router = useRouter();
  const colors = useColors();
  // The navigators paint their own scene background from this theme; the default grey showed between pages.
  const navigationTheme = useMemo(
    () => ({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.canvas } }),
    [colors.canvas],
  );
  const segments = useSegments();
  const { isLoading, profile, session } = useSupabaseSession();
  const legal = usePendingLegal();
  const pendingLegal = legal.pending.length > 0;
  const [fontsLoaded] = useFonts({
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const redirect = useMemo(
    () =>
      resolveAuthRedirect({
        pendingLegal,
        profileRole: profile?.role ?? null,
        segments,
        session,
      }),
    [pendingLegal, profile?.role, segments, session],
  );

  useEffect(() => {
    // While the consents are loading `pending` is empty: redirecting then would bounce a blocked user off /accept-terms.
    if (!isLoading && !legal.isLoading && redirect) {
      router.replace(redirect);
    }
  }, [isLoading, legal.isLoading, redirect, router]);

  if (isLoading || legal.isLoading || !fontsLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <ShopGate>
        <NotificationsPromptGate />
        <Stack screenOptions={{ headerShown: false }} />
      </ShopGate>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    // Native gestures (MonthCalendar's swipe) need this root; JS responders are cancelled inside the Android pager.
    <GestureHandlerRootView style={styles.root}>
      <AppProviders>
        <CurrentShopProvider>
          <ShopThemeProvider>
            <RootNavigator />
          </ShopThemeProvider>
        </CurrentShopProvider>
      </AppProviders>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
