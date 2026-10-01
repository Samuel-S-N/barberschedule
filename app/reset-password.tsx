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
import { hasRecovery, parseRecoveryUrl, resolveRecoveryStatus, type RecoveryStatus } from "../src/features/auth/recovery";
import { errorMessage } from "../src/i18n/errors";
import { useSupabaseSession } from "../src/providers/AppProviders";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isLoading, session, supabase } = useSupabaseSession();
  const [linkFailed, setLinkFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolved = resolveRecoveryStatus({ hasSession: session !== null, isLoading, platform: Platform.OS, proof: hasRecovery() });
  const status: RecoveryStatus = linkFailed || (timedOut && resolved === "checking") ? "invalid" : resolved;
  const problem = next || confirm ? validateNewPassword(next, confirm) : null;
  const problemText = problem === "password" ? t("profile.security.tooShort") : problem === "mismatch" ? t("profile.security.mismatch") : undefined;

  // Native: the deep link carries the tokens in its fragment. Web needs nothing here: detectSessionInUrl already
  // turned the link into a session and the provider recorded the PASSWORD_RECOVERY proof.
  useEffect(() => {
    if (Platform.OS === "web") return;

    let active = true;
    const handle = async (url: string | null) => {
      const link = parseRecoveryUrl(url);

      if (link.kind === "none") return;
      if (link.kind === "error" || !(await startRecoverySession(supabase, link))) {
        if (active) setLinkFailed(true);
      }
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", (event) => void handle(event.url));
    // Opened without a recovery link (typed URL, stale screen): do not spin forever.
    const timeout = setTimeout(() => active && setTimedOut(true), 8000);

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
      setError(errorMessage(caught, t, t("auth.reset.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const canSave = !saving && Boolean(next) && validateNewPassword(next, confirm) === null;

  return (
    <Screen className="flex-1 bg-canvas" keyboardAvoiding>
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
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
                <Input autoComplete="new-password" label={t("auth.reset.newPassword")} onChangeText={setNext} secureTextEntry testID="reset-new" textContentType="newPassword" value={next} />
                <Input autoComplete="new-password" error={problemText} label={t("auth.reset.confirm")} onChangeText={setConfirm} secureTextEntry onSubmitEditing={() => canSave && void save()} returnKeyType="go" testID="reset-confirm" textContentType="newPassword" value={confirm} />
                <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
                <Button
                  disabled={!canSave}
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
