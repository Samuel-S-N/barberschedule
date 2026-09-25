import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { signInWithPassword } from "../../src/features/auth/api";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

export default function LoginScreen() {
  const router = useRouter();
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
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">Sign in</Text>
            <Text className="text-base font-sans text-neutral-600">
              Use the same Barberschedule account on Web, iOS, or Android.
            </Text>
            <Input label="Email" onChangeText={setEmail} testID="login-email" value={email} />
            <Input label="Password" onChangeText={setPassword} secureTextEntry testID="login-password" value={password} />
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
            <Button
              disabled={!email.trim() || !password || isLoading || isSubmitting}
              label="Sign in"
              onPress={handleSignIn}
              size="lg"
            />
            <Button label="Forgot password?" onPress={() => router.push("/forgot-password")} variant="ghost" />
            <Button label="Create account" onPress={() => router.push("/signup")} variant="outline" />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
