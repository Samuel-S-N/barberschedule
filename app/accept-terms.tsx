import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../src/components/domain/Toast";
import { Button } from "../src/components/ui/Button";
import { Screen } from "../src/components/ui/Screen";
import { SignOutButton } from "../src/features/account/SignOutButton";
import { errorMessage } from "../src/i18n/errors";
import { LegalLinks } from "../src/features/legal/LegalLinks";
import { useAcceptLegal } from "../src/features/legal/use-accept-legal";
import { usePendingLegal } from "../src/features/legal/use-pending-legal";

export default function AcceptTermsScreen() {
  const { t } = useTranslation();
  const { pending } = usePendingLegal();
  const accept = useAcceptLegal();

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl leading-[44px] font-display-bold text-ink">{t("legal.gate.title")}</Text>
            <Text className="text-base font-sans text-neutral-700">{t("legal.gate.body")}</Text>
            <LegalLinks kinds={pending} testIDPrefix="gate-link" />
            <Button disabled={accept.isPending || pending.length === 0} label={t("legal.gate.accept")} onPress={() => accept.mutate(pending)} size="lg" testID="gate-accept" />
            <SignOutButton />
            <Toast message={accept.error ? errorMessage(accept.error, t, t("legal.gate.error")) : ""} onDismiss={() => accept.reset()} variant="error" visible={accept.isError} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
