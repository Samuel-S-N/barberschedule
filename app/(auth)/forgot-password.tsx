import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { requestPasswordReset } from "../../src/features/auth/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isLoading, supabase } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await requestPasswordReset(supabase, email.trim());
      setFeedback({ message: t("auth.reset.sent"), variant: "success" });
    } catch (caught) {
      setFeedback({ message: errorMessage(caught, t as never, t("auth.reset.error")), variant: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.reset.title")}</Text>
            <Text className="text-base font-sans text-neutral-600">{t("auth.reset.subtitle")}</Text>
            <Input label={t("common.email")} onChangeText={setEmail} testID="reset-email" value={email} />
            <Toast
              message={feedback?.message ?? ""}
              onDismiss={() => setFeedback(null)}
              variant={feedback?.variant ?? "info"}
              visible={feedback !== null}
            />
            <Button
              disabled={!email.trim() || isLoading || isSubmitting}
              label={t("auth.reset.submit")}
              onPress={submit}
              size="lg"
            />
            <Button label={t("auth.reset.backToSignIn")} onPress={() => router.replace("/login")} variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
