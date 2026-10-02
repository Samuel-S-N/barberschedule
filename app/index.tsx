import { Redirect } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Toast } from "../src/components/domain/Toast";
import { Button } from "../src/components/ui/Button";
import { Screen } from "../src/components/ui/Screen";
import { signOut } from "../src/features/auth/api";
import { errorMessage } from "../src/i18n/errors";
import { useSupabaseSession } from "../src/providers/AppProviders";

export default function HomeScreen() {
  const { t } = useTranslation();
  const { profile, supabase } = useSupabaseSession();
  const [feedback, setFeedback] = useState<string | null>(null);

  if (profile?.role === "customer") return <Redirect href="/home" />;
  if (profile?.role === "barber") return <Redirect href="/my-agenda" />;
  if (profile?.role === "owner") return <Redirect href="/agenda" />;

  // An account without a known role: nothing to show but a way out.
  return (
    <Screen className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center gap-4 p-5">
        <Text className="text-base font-sans text-neutral-700">{t("owner.hub.signedInAs", { role: t("owner.roles.account") })}</Text>
        <Button
          label={t("common.signOut")}
          onPress={async () => {
            try {
              setFeedback(null);
              await signOut(supabase);
            } catch (error) {
              setFeedback(errorMessage(error, t, t("profile.signOutError")));
            }
          }}
        />
        <Toast message={feedback ?? ""} onDismiss={() => setFeedback(null)} variant="error" visible={feedback !== null} />
      </View>
    </Screen>
  );
}
