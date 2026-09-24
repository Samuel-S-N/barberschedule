import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { requestPasswordReset } from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

export default function ForgotPasswordScreen() {
  const router = useRouter();
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
      setFeedback({ message: "Password reset email sent.", variant: "success" });
    } catch (caught) {
      setFeedback({
        message: caught instanceof Error ? caught.message : "Unable to send reset email.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Reset password</Text>
            <Text className="text-base font-sans text-neutral-600">We will send a reset link if the account exists.</Text>
            <Input label="Email" onChangeText={setEmail} testID="reset-email" value={email} />
            <Toast
              message={feedback?.message ?? ""}
              onDismiss={() => setFeedback(null)}
              variant={feedback?.variant ?? "info"}
              visible={feedback !== null}
            />
            <Button
              disabled={!email.trim() || isLoading || isSubmitting}
              label="Send reset email"
              onPress={submit}
              size="lg"
            />
            <Button label="Back to sign in" onPress={() => router.replace("/login")} variant="ghost" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
