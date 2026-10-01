import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { signUpCustomer } from "../../src/features/auth/api";
import { parseSignupInput } from "../../src/features/auth/validation";
import { errorMessage } from "../../src/i18n/errors";
import { formatPhone } from "../../src/features/account/phone";
import { colors } from "../../src/lib/design/colors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function SignupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const field = useFieldChain(6);
  const { supabase } = useSupabaseSession();
  const [form, setForm] = useState({ confirmPassword: "", email: "", fullName: "", nickname: "", password: "", phone: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  // Validation returns translation keys; translate them at render time so a language change applies at once.
  const fieldError = (key: string) => (errors[key] ? t(errors[key] as never) : undefined);

  const submit = async () => {
    const parsed = parseSignupInput({ ...form, acceptedTerms });
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setServerError(null);
    setIsSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUpCustomer(supabase, parsed.value);
      setConfirmationSent(needsEmailConfirmation);
    } catch (caught) {
      setServerError(errorMessage(caught, t, t("auth.signup.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <EmptyState title={t("auth.signup.checkEmailTitle")} />
          <Text className="max-w-[420px] text-center text-base font-sans text-neutral-600">
            {t("auth.signup.checkEmailBody", { email: form.email.trim().toLowerCase() })}
          </Text>
          <Button label={t("auth.signup.backToSignIn")} onPress={() => router.replace("/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="flex-1 bg-canvas">
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.signup.title")}</Text>
            <Input {...field(0)} autoCapitalize="words" autoComplete="name" error={fieldError("fullName")} label={t("common.fullName")} onChangeText={set("fullName")} testID="signup-name" value={form.fullName} />
            <Input {...field(1)} autoCapitalize="words" error={fieldError("nickname")} label={t("common.nicknameOptional")} onChangeText={set("nickname")} testID="signup-nickname" value={form.nickname} />
            <Input {...field(2)} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" error={fieldError("email")} label={t("common.email")} onChangeText={set("email")} testID="signup-email" value={form.email} />
            <Input {...field(3)} autoComplete="tel" keyboardType="phone-pad" error={fieldError("phone")} label={t("common.phoneOptional")} onChangeText={(value) => set("phone")(formatPhone(value))} testID="signup-phone" value={form.phone} />
            <Input {...field(4)} autoComplete="new-password" error={fieldError("password")} label={t("common.password")} onChangeText={set("password")} secureTextEntry testID="signup-password" textContentType="newPassword" value={form.password} />
            <Input {...field(5)} autoComplete="new-password" error={fieldError("confirmPassword")} label={t("auth.signup.confirmPassword")} onChangeText={set("confirmPassword")} secureTextEntry onSubmitEditing={() => !isSubmitting && void submit()} returnKeyType="go" testID="signup-confirm-password" textContentType="newPassword" value={form.confirmPassword} />
            <Pressable
              accessibilityLabel={t("auth.signup.acceptTerms")}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              className="min-h-[44px] flex-row items-center gap-3"
              onPress={() => setAcceptedTerms((value) => !value)}
              testID="signup-accept-terms"
            >
              <View className={`h-6 w-6 items-center justify-center rounded-md border ${acceptedTerms ? "border-primary-400 bg-primary-400" : "border-neutral-300 bg-surface"}`}>
                {acceptedTerms ? <Check color={colors.ink} size={16} /> : null}
              </View>
              <Text className="flex-1 text-sm font-sans text-neutral-700">{t("auth.signup.acceptTerms")}</Text>
            </Pressable>
            {errors.acceptedTerms ? <Text className="text-sm font-sans text-danger-500">{fieldError("acceptedTerms")}</Text> : null}
            <Button label={t("auth.signup.readTerms")} onPress={() => router.push("/legal")} size="sm" variant="ghost" />
            <Toast message={serverError ?? ""} onDismiss={() => setServerError(null)} variant="error" visible={serverError !== null} />
            <Button disabled={isSubmitting} label={t("auth.signup.submit")} onPress={submit} size="lg" />
            <Button label={t("auth.signup.haveAccount")} onPress={() => router.replace("/login")} variant="ghost" />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
