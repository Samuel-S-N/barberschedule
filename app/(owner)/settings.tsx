import { useRouter } from "expo-router";
import { Info, Lock, LogOut, Scissors, Settings, ShieldCheck, User } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

import { Avatar } from "../../src/components/domain/Avatar";
import { MenuBlock } from "../../src/components/domain/MenuBlock";
import { Toast } from "../../src/components/domain/Toast";
import { Screen } from "../../src/components/ui/Screen";
import { useMyProfile } from "../../src/features/account/use-my-profile";
import { signOut } from "../../src/features/auth/api";
import { useOwnerAsBarber } from "../../src/features/barbers/owner/use-owner-as-barber";
import { errorMessage } from "../../src/i18n/errors";
import { colors } from "../../src/lib/design/colors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile: sessionProfile, session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const asBarber = useOwnerAsBarber();
  const [error, setError] = useState<string | null>(null);
  const name = profile.data?.nickname || profile.data?.fullName || sessionProfile?.fullName || t("owner.settings.ownerFallback");

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar accessibilityLabel={t("profile.menu.account")} name={name} onPress={() => router.push("/owner-profile/account")} testID="profile-avatar" uri={profile.data?.avatarUrl} />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
              <Text className="text-xs font-sans-medium uppercase text-primary-600">{t("owner.roles.owner")}</Text>
            </View>

            <MenuBlock
              items={[
                { icon: User, key: "account", label: t("profile.menu.account"), onPress: () => router.push("/owner-profile/account") },
                { icon: ShieldCheck, key: "security", label: t("profile.menu.security"), onPress: () => router.push("/owner-profile/security") },
              ]}
            />

            <View className="gap-2 rounded-[20px] border border-neutral-200 bg-surface p-4">
              <View className="flex-row items-center gap-3">
                <Scissors color={colors.primary[600]} size={22} />
                <Text className="flex-1 text-base font-sans-medium text-ink">{t("owner.profile.asBarber")}</Text>
                <Switch
                  accessibilityLabel={t("owner.profile.asBarber")}
                  disabled={asBarber.isLoading || asBarber.toggle.isPending}
                  onValueChange={(on) => asBarber.toggle.mutate(on, { onError: (caught) => setError(errorMessage(caught, t, t("owner.barbers.updateError"))) })}
                  testID="owner-as-barber"
                  thumbColor="#ffffff"
                  trackColor={{ false: colors.neutral[200], true: colors.primary[400] }}
                  value={asBarber.active}
                />
              </View>
              <Text className="text-xs font-sans text-neutral-600">{t("owner.profile.asBarberHint")}</Text>
            </View>
            {asBarber.active && asBarber.barberId ? (
              <MenuBlock items={[{ icon: Scissors, key: "my-barber", label: t("owner.profile.myBarber"), onPress: () => router.push({ params: { id: asBarber.barberId ?? "" }, pathname: "/barber-profile" }) }]} />
            ) : null}

            <MenuBlock
              items={[
                { icon: Lock, key: "privacy", label: t("profile.menu.privacy"), onPress: () => router.push("/owner-profile/privacy") },
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/owner-profile/settings") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/owner-profile/about") },
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
              <Text className="text-base font-sans-semibold text-danger-500">{t("common.signOut")}</Text>
            </Pressable>
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
