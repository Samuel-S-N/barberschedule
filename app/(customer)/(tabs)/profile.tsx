import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Info, Repeat, Settings, ShieldCheck, User, UserCog } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { MenuBlock } from "../../../src/components/domain/MenuBlock";
import { Screen } from "../../../src/components/ui/Screen";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { listMyCustomers } from "../../../src/features/customers/api";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { useCurrentShop } from "../../../src/features/shops/CurrentShopProvider";
import { InstallPrompt } from "../../../src/features/install/InstallPrompt";
import { NotificationPrompt } from "../../../src/features/notifications/NotificationPrompt";

export default function CustomerProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const shopId = useCurrentShop().shop?.id ?? "";
  const customers = useQuery({ enabled: Boolean(shopId), queryFn: () => listMyCustomers(supabase, shopId), queryKey: ["my-customers", shopId] });
  const name = profile.data?.nickname || customers.data?.[0]?.fullName || profile.data?.fullName || "";

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-6">
            <InstallPrompt />
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
              items={[{ icon: Repeat, key: "recurrence", label: t("profile.menu.recurrence"), onPress: () => router.push("/me/recurrence") }]}
            />
            <MenuBlock
              items={[
                { icon: Settings, key: "settings", label: t("profile.menu.settings"), onPress: () => router.push("/me/settings") },
                { icon: UserCog, key: "privacy", label: t("profile.menu.privacy"), onPress: () => router.push("/me/privacy") },
                { icon: Info, key: "about", label: t("profile.menu.about"), onPress: () => router.push("/me/about") },
              ]}
            />

            <NotificationPrompt />

          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
