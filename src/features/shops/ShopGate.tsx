import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { signOut } from "../auth/api";
import { LegalFooter } from "../legal/LegalLinks";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "./CurrentShopProvider";
import { shopBaseDomain } from "./host";
import { useMyShop } from "./my-shop";
import { closedShopAction, closedShopAllows, resolveShopRoute } from "./shop-route";
import { shopUrl } from "./resolve-slug";

function Message({ action, body, footer, title }: { action?: { label: string; onPress: () => void }; body: string; footer?: ReactNode; title: string }) {
  return (
    <Screen className="flex-1 bg-canvas">
      <View className="flex-1 items-center justify-center gap-4 p-5">
        <Text accessibilityRole="header" className="max-w-[420px] text-center text-3xl leading-[44px] font-display-bold text-ink">{title}</Text>
        <Text className="max-w-[420px] text-center text-base font-sans text-neutral-600">{body}</Text>
        {action ? <Button label={action.label} onPress={action.onPress} /> : null}
        {footer}
      </View>
    </Screen>
  );
}

// Decides what this host may show before any navigator renders: loading, "business not found", the bare-domain page,
// a retry, or a redirect of staff to their own shop's subdomain. Everything else is the normal app.
export function ShopGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { profile, session, supabase } = useSupabaseSession();
  const { retry, shop, slug, status } = useCurrentShop();
  const pathname = usePathname();
  const router = useRouter();
  // The closed page renders BEFORE the navigator exists, so it cannot navigate itself: a tap records where to go, the navigator is
  // rendered for that one visit, and then this effect moves there (the page returns whenever the visitor is back on a blocked path).
  const [entry, setEntry] = useState<string | null>(null);
  // The staff chose to sign in: from then on the login and password recovery are reachable (see closedShopAllows).
  const [staffEntry, setStaffEntry] = useState(false);
  const mine = useMyShop();
  const staff = profile?.role === "owner" || profile?.role === "professional";
  const route = resolveShopRoute({
    canRedirect: Platform.OS === "web",
    currentSlug: slug,
    // Staff whose lookup failed or has no shop must not hang on the spinner: treat both as "no staff shop".
    mySlug: !staff ? null : mine.isPending ? undefined : mine.data?.slug ?? null,
    role: profile?.role ?? null,
    shopReady: shop?.ready,
    signedIn: session !== null,
    status,
  });

  useEffect(() => {
    if (entry === null) return;
    if (pathname === entry) setEntry(null);
    else router.replace(entry as never);
  }, [entry, pathname, router]);

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

  if (route.kind === "coming-soon") {
    // The legal documents stay readable and the staff can reach the login (and password recovery) to finish the setup.
    if (closedShopAllows(pathname, staffEntry) || entry !== null) return <>{children}</>;

    const action = closedShopAction(session !== null);

    return (
      <Message
        action={action === "sign-out" ? { label: t("common.signOut"), onPress: () => void signOut(supabase) } : { label: t("shopGate.staffLogin"), onPress: () => { setStaffEntry(true); setEntry("/login"); } }}
        body={t("shopGate.comingSoonBody", { name: shop?.name ?? "" })}
        footer={<LegalFooter onOpen={setEntry} />}
        title={t("shopGate.comingSoonTitle")}
      />
    );
  }

  return <>{children}</>;
}
