import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Clock, Coins, Repeat, Info, Lock, Scissors, Settings, ShieldCheck, User } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { Screen } from "../../../src/components/ui/Screen";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { getMyProfessionalProfile } from "../../../src/features/professionals/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";
import { InstallPrompt } from "../../../src/features/install/InstallPrompt";

export default function ProfessionalProfileHub() {
  const router = useRouter();
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const { profile: sessionProfile, session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const professional = useQuery({ queryFn: () => getMyProfessionalProfile(supabase), queryKey: ["my-professional-profile", sessionProfile?.userId] });
  const name = profile.data?.nickname || professional.data?.name || profile.data?.fullName || "";

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <View className="items-center gap-1 pt-4">
              <Avatar
                accessibilityLabel={t("professional.hub.menu.account")}
                name={name}
                onPress={() => router.push("/my-profile/account")}
                testID="profile-avatar"
                uri={profile.data?.avatarUrl ?? professional.data?.avatarUrl}
              />
              <Text accessibilityRole="header" className="pt-3 text-2xl font-display-bold text-ink">{name}</Text>
              <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
              <Text className="text-xs font-sans-medium uppercase text-primary-600">{t("professional.hub.role")}</Text>
            </View>

            <MenuBlock
              items={[
                { icon: User, key: "account", label: t("professional.hub.menu.account"), onPress: () => router.push("/my-profile/account") },
                { icon: ShieldCheck, key: "security", label: t("profile.menu.security"), onPress: () => router.push("/my-profile/security") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Scissors, key: "services", label: t("professional.hub.menu.services"), onPress: () => router.push("/my-profile/services") },
                { icon: Clock, key: "availability", label: t("professional.hub.menu.availability"), onPress: () => router.push("/my-profile/availability") },
                { icon: Repeat, key: "recurrence", label: t("professional.hub.menu.recurrence"), onPress: () => router.push("/my-profile/recurrence") },
                { icon: Coins, key: "compensation", label: t("professional.hub.menu.compensation"), onPress: () => router.push("/my-profile/compensation") },
              ]}
            />
            <MenuBlock
              items={[
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/my-profile/settings") },
                { icon: Lock, key: "privacy", label: t("profile.menu.privacy"), onPress: () => router.push("/my-profile/privacy") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/my-profile/about") },
              ]}
            />

            <InstallPrompt />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
