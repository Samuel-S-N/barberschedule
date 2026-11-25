import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { Button } from "../../components/ui/Button";
import type { LegalKind } from "./types";

const PATH: Record<LegalKind, string> = { business: "/contrato", privacy: "/privacidade", terms: "/termos" };

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

// Small footer for pages shown before login (the closed-shop page): the two documents every visitor may read.
export function LegalFooter() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <View className="flex-row flex-wrap justify-center gap-2" testID="legal-footer">
      <Button label={t("legal.link.privacy")} onPress={() => router.push("/privacidade" as never)} size="sm" variant="ghost" />
      <Button label={t("legal.link.terms")} onPress={() => router.push("/termos" as never)} size="sm" variant="ghost" />
    </View>
  );
}
