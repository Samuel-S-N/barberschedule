import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, Text, View } from "react-native";

import { SkeletonBlock } from "../src/components/domain/SkeletonLoader";
import { Toast } from "../src/components/domain/Toast";
import { Button } from "../src/components/ui/Button";
import { Input } from "../src/components/ui/Input";
import { Screen } from "../src/components/ui/Screen";
import { validateNewPassword } from "../src/features/account/security";
import { completePasswordReset, startRecoverySession } from "../src/features/auth/api";
import { hasRecovery, parseRecoveryUrl } from "../src/features/auth/recovery";
import { errorMessage } from "../src/i18n/errors";
import { useSupabaseSession } from "../src/providers/AppProviders";

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isLoading, session, supabase } = useSupabaseSession();
  const [status, setStatus] = useState<Status>("checking");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = next || confirm ? validateNewPassword(next, confirm) : null;
  const problemText = problem === "password" ? t("profile.security.tooShort") : problem === "mismatch" ? t("profile.security.mismatch") : undefined;

  // Web: detectSessionInUrl already turned the link into a session; the provider recorded the PASSWORD_RECOVERY proof.
  useEffect(() => {
    if (Platform.OS !== "web" || isLoading) return;
    setStatus(session && hasRecovery() ? "ready" : "invalid");
  }, [isLoading, session]);

  // Native: the deep link carries the tokens in its fragment.
  useEffect(() => {
    if (Platform.OS === "web") return;

    let active = true;
    const handle = async (url: string | null) => {
      const link = parseRecoveryUrl(url);

      if (link.kind === "none") return;
      if (link.kind === "error") {
        if (active) setStatus("invalid");
        return;
      }

      const ok = await startRecoverySession(supabase, link);

      if (active) setStatus(ok ? "ready" : "invalid");
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", (event) => void handle(event.url));
    // Opened without a recovery link (typed URL, stale tab): do not spin forever.
    const timeout = setTimeout(() => {
      if (active) setStatus((current) => (current === "checking" ? "invalid" : current));
    }, 8000);

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [supabase]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await completePasswordReset(supabase, next);
      router.replace({ params: { notice: "password-reset" }, pathname: "/login" });
    } catch (caught) {
      setError(errorMessage(caught, t as never, t("auth.reset.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            {status === "checking" ? (
              <>
                <Text className="text-base font-sans text-neutral-600">{t("auth.reset.checking")}</Text>
                <SkeletonBlock height={56} width={320} />
              </>
            ) : null}
            {status === "invalid" ? (
              <>
                <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.reset.invalidTitle")}</Text>
                <Text className="text-base font-sans text-neutral-600">{t("auth.reset.invalidBody")}</Text>
                <Button label={t("auth.reset.requestNew")} onPress={() => router.replace("/forgot-password")} size="lg" />
                <Button label={t("auth.reset.backToSignIn")} onPress={() => router.replace("/login")} variant="ghost" />
              </>
            ) : null}
            {status === "ready" ? (
              <>
                <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("auth.reset.setTitle")}</Text>
                <Text className="text-base font-sans text-neutral-600">{t("auth.reset.setSubtitle")}</Text>
                <Input label={t("auth.reset.newPassword")} onChangeText={setNext} secureTextEntry testID="reset-new" value={next} />
                <Input error={problemText} label={t("auth.reset.confirm")} onChangeText={setConfirm} secureTextEntry testID="reset-confirm" value={confirm} />
                <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
                <Button
                  disabled={saving || !next || validateNewPassword(next, confirm) !== null}
                  label={t("auth.reset.saveSubmit")}
                  onPress={() => void save()}
                  size="lg"
                  testID="reset-submit"
                />
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
