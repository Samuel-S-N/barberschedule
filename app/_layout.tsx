import "../global.css";

import { Stack, useRouter, useSegments } from "expo-router";
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

import { resolveAuthRedirect } from "../src/features/auth/session";
import { AppProviders } from "../src/providers/AppProviders";
import { useSupabaseSession } from "../src/providers/AppProviders";

export function RootNavigator() {
  const router = useRouter();
  const segments = useSegments();
  const { isLoading, profile, session } = useSupabaseSession();
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
        profileRole: profile?.role ?? null,
        segments,
        session,
      }),
    [profile?.role, segments, session],
  );

  useEffect(() => {
    if (!isLoading && redirect) {
      router.replace(redirect);
    }
  }, [isLoading, redirect, router]);

  if (isLoading || !fontsLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
});
