import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { signUpCustomer } from "../../src/features/auth/api";
import { parseSignupInput } from "../../src/features/auth/validation";
import { colors } from "../../src/lib/design/colors";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

export default function SignupScreen() {
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const [form, setForm] = useState({ email: "", fullName: "", password: "", phone: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

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
      setServerError(caught instanceof Error ? caught.message : "Unable to create your account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <Screen className="flex-1 bg-canvas">
        <View className="flex-1 items-center justify-center gap-4 p-5">
          <EmptyState title="Check your email" />
          <Text className="max-w-[420px] text-center text-base font-sans text-neutral-600">
            We sent a confirmation link to {form.email.trim().toLowerCase()}. Open it, then sign in.
          </Text>
          <Button label="Back to sign in" onPress={() => router.replace("/login")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Create account</Text>
            <Input error={errors.fullName} label="Full name" onChangeText={set("fullName")} testID="signup-name" value={form.fullName} />
            <Input error={errors.email} label="Email" onChangeText={set("email")} testID="signup-email" value={form.email} />
            <Input error={errors.phone} label="Phone (optional)" onChangeText={set("phone")} testID="signup-phone" value={form.phone} />
            <Input error={errors.password} label="Password" onChangeText={set("password")} secureTextEntry testID="signup-password" value={form.password} />
            <Pressable
              accessibilityLabel="I accept the terms and privacy policy"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptedTerms }}
              className="min-h-[44px] flex-row items-center gap-3"
              onPress={() => setAcceptedTerms((value) => !value)}
              testID="signup-accept-terms"
            >
              <View className={`h-6 w-6 items-center justify-center rounded-md border ${acceptedTerms ? "border-primary-400 bg-primary-400" : "border-neutral-300 bg-surface"}`}>
                {acceptedTerms ? <Check color={colors.ink} size={16} /> : null}
              </View>
              <Text className="flex-1 text-sm font-sans text-neutral-700">I accept the terms and privacy policy</Text>
            </Pressable>
            {errors.acceptedTerms ? <Text className="text-sm font-sans text-danger-500">{errors.acceptedTerms}</Text> : null}
            <Button label="Read terms and privacy policy" onPress={() => router.push("/legal")} size="sm" variant="ghost" />
            <Toast message={serverError ?? ""} onDismiss={() => setServerError(null)} variant="error" visible={serverError !== null} />
            <Button disabled={isSubmitting} label="Create account" onPress={submit} size="lg" />
            <Button label="I already have an account" onPress={() => router.replace("/login")} variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
