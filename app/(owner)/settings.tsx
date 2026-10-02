import { useRouter } from "expo-router";
import { Globe, LogOut } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../src/components/domain/Avatar";
import { MenuBlock } from "../../src/components/domain/MenuBlock";
import { Toast } from "../../src/components/domain/Toast";
import { Screen } from "../../src/components/ui/Screen";
import { signOut } from "../../src/features/auth/api";
import { errorMessage } from "../../src/i18n/errors";
import { colors } from "../../src/lib/design/colors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, session, supabase } = useSupabaseSession();
  const [error, setError] = useState<string | null>(null);
  const name = profile?.fullName ?? t("owner.settings.ownerFallback");

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar name={name} />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
              <Text className="text-xs font-sans-medium uppercase text-primary-600">{t("owner.roles.owner")}</Text>
            </View>
            <MenuBlock items={[{ icon: Globe, key: "language", label: t("profile.settings.language"), onPress: () => router.push("/language") }]} />
            <Pressable
              accessibilityRole="button"
              className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-[20px] border border-neutral-200 bg-surface"
              onPress={async () => {
                try {
                  await signOut(supabase);
                } catch (caught) {
                  setError(errorMessage(caught, t, t("profile.signOutError")));
                }
              }}
              testID="profile-signout"
            >
              <LogOut color={colors.danger[500]} size={20} />
              <Text className="text-base font-sans-semibold text-danger-500">{t("common.signOut")}</Text>
            </Pressable>
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
