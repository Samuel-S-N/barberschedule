import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";

import { Button } from "../../components/ui/Button";
import type { LegalKind } from "./types";

const PATH: Record<LegalKind, string> = { business: "/contrato", privacy: "/privacidade", terms: "/termos" };

const open = (router: ReturnType<typeof useRouter>, path: string) => () => {
  if (Platform.OS === "web" && typeof window !== "undefined") window.location.assign(path);
  else router.push(path as never);
};

export function LegalLinks({ kinds, testIDPrefix = "legal-link" }: { kinds: LegalKind[]; testIDPrefix?: string }) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="gap-2">
      {kinds.map((kind) => (
        <Button key={kind} label={t(`legal.link.${kind}`)} onPress={() => router.push(PATH[kind] as never)} testID={`${testIDPrefix}-${kind}`} variant="outline" />
      ))}
    </View>
  );
}

// Small footer for pages shown before login (the closed-shop page): the two documents every visitor may read. That page renders
// BEFORE the navigator exists, so on the web it navigates with a full page load instead of router.push.
export function LegalFooter() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="flex-row flex-wrap justify-center gap-2" testID="legal-footer">
      <Button label={t("legal.link.privacy")} onPress={open(router, "/privacidade")} size="sm" variant="ghost" />
      <Button label={t("legal.link.terms")} onPress={open(router, "/termos")} size="sm" variant="ghost" />
    </View>
  );
}
