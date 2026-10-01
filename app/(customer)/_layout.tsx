import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Button } from "../../src/components/ui/Button";
import { ensureMyCustomer } from "../../src/features/account/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

// A cold start or web refresh on /reschedule still gets the tabs underneath, so back has somewhere to go.
export const unstable_settings = { initialRouteName: "(tabs)" };

export default function CustomerLayout() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const bootstrap = useQuery({
    enabled: profile?.role === "customer",
    queryFn: () => ensureMyCustomer(supabase),
    queryKey: ["ensure-my-customer", profile?.userId],
    staleTime: Infinity,
  });

  if (bootstrap.isError) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <Text className="text-base font-sans text-danger-500">{t("layout.bootstrapError")}</Text>
          <Button label={t("common.tryAgain")} onPress={() => void bootstrap.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!bootstrap.data) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="items-center gap-3 p-5">
          <SkeletonBlock height={56} width={320} />
          <SkeletonBlock height={56} width={320} />
        </View>
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="reschedule" />
      <Stack.Screen name="me/account" />
      <Stack.Screen name="me/security" />
      <Stack.Screen name="me/settings" />
      <Stack.Screen name="me/language" />
      <Stack.Screen name="me/privacy" />
      <Stack.Screen name="me/about" />
    </Stack>
  );
}
