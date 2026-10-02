import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Clock, Coins, Info, LogOut, Scissors, Settings, ShieldCheck, User } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { Toast } from "../../../src/components/domain/Toast";
import { Screen } from "../../../src/components/ui/Screen";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { signOut } from "../../../src/features/auth/api";
import { getMyBarberProfile } from "../../../src/features/barbers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { colors } from "../../../src/lib/design/colors";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function BarberProfileHub() {
  const router = useRouter();
  const { t } = useTranslation();
  const { profile: sessionProfile, session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", sessionProfile?.userId] });
  const name = profile.data?.nickname || barber.data?.name || profile.data?.fullName || "";
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar
                accessibilityLabel={t("barber.hub.menu.account")}
                name={name}
                onPress={() => router.push("/my-profile/account")}
                testID="profile-avatar"
                uri={profile.data?.avatarUrl ?? barber.data?.avatarUrl}
              />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
              <Text className="text-xs font-sans-medium uppercase text-primary-600">{t("barber.hub.role")}</Text>
            </View>

            <MenuBlock
              items={[
                { icon: User, key: "account", label: t("barber.hub.menu.account"), onPress: () => router.push("/my-profile/account") },
                { icon: ShieldCheck, key: "security", label: t("profile.menu.security"), onPress: () => router.push("/my-profile/security") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Scissors, key: "services", label: t("barber.hub.menu.services"), onPress: () => router.push("/my-profile/services") },
                { icon: Clock, key: "hours", label: t("barber.hub.menu.hours"), onPress: () => router.push("/my-profile/hours") },
                { icon: Coins, key: "compensation", label: t("barber.hub.menu.compensation"), onPress: () => router.push("/my-profile/compensation") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/my-profile/settings") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/my-profile/about") },
              ]}
            />

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
              <Text className="text-base font-sans-semibold text-danger-500">{t("profile.signOut")}</Text>
            </Pressable>

            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
