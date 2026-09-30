import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Info, LogOut, Settings, ShieldCheck, User, UserCog } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { Toast } from "../../../src/components/domain/Toast";
import { Screen } from "../../../src/components/ui/Screen";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { signOut } from "../../../src/features/auth/api";
import { listMyCustomers } from "../../../src/features/customers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { colors } from "../../../src/lib/design/colors";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const name = customers.data?.[0]?.fullName ?? profile.data?.fullName ?? "";
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar
                accessibilityLabel={t("profile.menu.account")}
                name={name}
                onPress={() => router.push("/me/account")}
                testID="profile-avatar"
                uri={profile.data?.avatarUrl}
              />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
            </View>

            <MenuBlock
              items={[
                { icon: User, key: "account", label: t("profile.menu.account"), onPress: () => router.push("/me/account") },
                { icon: ShieldCheck, key: "security", label: t("profile.menu.security"), onPress: () => router.push("/me/security") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/me/settings") },
                { icon: UserCog, key: "privacy", label: t("profile.menu.privacy"), onPress: () => router.push("/me/privacy") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/me/about") },
              ]}
            />

            <Pressable
              accessibilityRole="button"
              className="min-h-[56px] flex-row items-center justify-center gap-2 rounded-[20px] border border-neutral-200 bg-surface"
              onPress={async () => {
                try {
                  await signOut(supabase);
                } catch (caught) {
                  setError(errorMessage(caught, t as never, t("profile.signOutError")));
                }
              }}
              testID="profile-signout"
            >
              <LogOut color={colors.danger[500]} size={20} />
              <Text className="text-base font-sans-semibold text-danger-500">{t("profile.signOut")}</Text>
            </Pressable>

            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
