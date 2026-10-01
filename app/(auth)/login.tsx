import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { signInWithPassword } from "../../src/features/auth/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function LoginScreen() {
  const router = useRouter();
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const { t } = useTranslation();
  const { isLoading, supabase } = useSupabaseSession();
  const field = useFieldChain(2);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);

  const handleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await signInWithPassword(supabase, email.trim(), password);
    } catch (caught) {
      setError(errorMessage(caught, t, t("auth.login.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = Boolean(email.trim() && password && !isLoading && !isSubmitting);
  const submitFromKeyboard = () => {
    if (canSubmit) void handleSignIn();
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.login.title")}</Text>
            <Text className="text-base font-sans text-neutral-600">{t("auth.login.subtitle")}</Text>
            <Input {...field(0)} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" label={t("common.email")} onChangeText={setEmail} testID="login-email" value={email} />
            <Input {...field(1)} autoComplete="current-password" label={t("common.password")} onChangeText={setPassword} onSubmitEditing={submitFromKeyboard} returnKeyType="go" textContentType="password" secureTextEntry testID="login-password" value={password} />
            <Toast message={t("auth.login.passwordReset")} onDismiss={() => setNoticeDismissed(true)} variant="success" visible={notice === "password-reset" && !noticeDismissed} />
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
            <Button
              disabled={!canSubmit}
              label={t("auth.login.submit")}
              onPress={handleSignIn}
              size="lg"
            />
            <Button label={t("auth.login.forgot")} onPress={() => router.push("/forgot-password")} variant="ghost" />
            <Button label={t("auth.login.createAccount")} onPress={() => router.push("/signup")} variant="outline" />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
