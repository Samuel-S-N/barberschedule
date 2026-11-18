import { useEffect } from "react";
import type { PropsWithChildren } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { signOut } from "../auth/api";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "./CurrentShopProvider";
import { shopBaseDomain } from "./host";
import { useMyShop } from "./my-shop";
import { resolveShopRoute } from "./shop-route";
import { shopUrl } from "./resolve-slug";

function Message({ action, body, title }: { action?: { label: string; onPress: () => void }; body: string; title: string }) {
  return (
    <Screen className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center gap-4 p-5">
        <Text accessibilityRole="header" className="max-w-[420px] text-center text-3xl leading-[44px] font-display-bold text-ink">{title}</Text>
        <Text className="max-w-[420px] text-center text-base font-sans text-neutral-600">{body}</Text>
        {action ? <Button label={action.label} onPress={action.onPress} /> : null}
      </View>
    </Screen>
  );
}

// Decides what this host may show before any navigator renders: loading, "business not found", the bare-domain page,
// a retry, or a redirect of staff to their own shop's subdomain. Everything else is the normal app.
export function ShopGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { profile, session, supabase } = useSupabaseSession();
  const { retry, slug, status } = useCurrentShop();
  const mine = useMyShop();
  const staff = profile?.role === "owner" || profile?.role === "professional";
  const route = resolveShopRoute({
    canRedirect: Platform.OS === "web",
    currentSlug: slug,
    // Staff whose lookup failed or has no shop must not hang on the spinner: treat both as "no staff shop".
    mySlug: !staff ? null : mine.isPending ? undefined : mine.data?.slug ?? null,
    role: profile?.role ?? null,
    signedIn: session !== null,
    status,
  });

  useEffect(() => {
    if (route.kind === "redirect") window.location.replace(shopUrl(route.slug, shopBaseDomain(), window.location));
  }, [route]);

  if (route.kind === "wait" || route.kind === "redirect") {
    return <View className="flex-1 items-center justify-center bg-canvas"><ActivityIndicator /></View>;
  }
  if (route.kind === "not-found") return <Message body={t("shopGate.notFoundBody")} title={t("shopGate.notFoundTitle")} />;
  if (route.kind === "error") return <Message action={{ label: t("common.tryAgain"), onPress: retry }} body={t("shopGate.errorBody")} title={t("shopGate.notFoundTitle")} />;
  if (route.kind === "bare") {
    return <Message action={{ label: t("common.signOut"), onPress: () => void signOut(supabase) }} body={t("shopGate.bareBody")} title={t("shopGate.bareTitle")} />;
  }

  return <>{children}</>;
}
