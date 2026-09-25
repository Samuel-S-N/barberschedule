import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { signInWithPassword } from "../../src/features/auth/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isLoading, supabase } = useSupabaseSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await signInWithPassword(supabase, email.trim(), password);
    } catch (caught) {
      setError(errorMessage(caught, t as never, t("auth.login.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.login.title")}</Text>
            <Text className="text-base font-sans text-neutral-600">{t("auth.login.subtitle")}</Text>
            <Input label={t("common.email")} onChangeText={setEmail} testID="login-email" value={email} />
            <Input label={t("common.password")} onChangeText={setPassword} secureTextEntry testID="login-password" value={password} />
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
            <Button
              disabled={!email.trim() || !password || isLoading || isSubmitting}
              label={t("auth.login.submit")}
              onPress={handleSignIn}
              size="lg"
            />
            <Button label={t("auth.login.forgot")} onPress={() => router.push("/forgot-password")} variant="ghost" />
            <Button label={t("auth.login.createAccount")} onPress={() => router.push("/signup")} variant="outline" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
