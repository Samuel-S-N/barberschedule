import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../../src/components/domain/Toast";
import { Button } from "../../../../src/components/ui/Button";
import { Input, useFieldChain } from "../../../../src/components/ui/Input";
import { Screen } from "../../../../src/components/ui/Screen";
import { changePassword } from "../../../../src/features/account/api";
import { validateNewPassword } from "../../../../src/features/account/security";
import { errorMessage } from "../../../../src/i18n/errors";
import { useBack } from "../../../../src/lib/navigation/use-back";
import { createPasswordCheckClient } from "../../../../src/lib/supabase/client";
import { useSupabaseSession } from "../../../../src/providers/AppProviders";

export default function PasswordScreen() {
  const { t } = useTranslation();
  const field = useFieldChain(3);
  const back = useBack();
  const { session, supabase } = useSupabaseSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const problem = next || confirm ? validateNewPassword(next, confirm) : null;
  const problemText = problem === "password" ? t("profile.security.tooShort") : problem === "mismatch" ? t("profile.security.mismatch") : undefined;

  const change = useMutation({
    mutationFn: () => changePassword(supabase, createPasswordCheckClient(), session!.user.email!, current, next),
    onError: (caught) => setFeedback({ message: errorMessage(caught, t, t("profile.security.error")), variant: "error" }),
    onSuccess: (result) => {
      if (result === "wrong-password") {
        setFeedback({ message: t("profile.security.wrongCurrent"), variant: "error" });
        return;
      }
      setFeedback({ message: t("profile.security.changed"), variant: "success" });
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });

  const canChange = !change.isPending && Boolean(current) && Boolean(next) && validateNewPassword(next, confirm) === null;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.security.passwordTitle")} />
            <Input {...field(0)} autoComplete="current-password" label={t("profile.security.current")} onChangeText={setCurrent} secureTextEntry testID="security-current" textContentType="password" value={current} />
            <Input {...field(1)} autoComplete="new-password" label={t("profile.security.next")} onChangeText={setNext} secureTextEntry testID="security-next" textContentType="newPassword" value={next} />
            <Input {...field(2)} autoComplete="new-password" error={problemText} label={t("profile.security.confirm")} onChangeText={setConfirm} secureTextEntry onSubmitEditing={() => canChange && change.mutate()} returnKeyType="go" testID="security-confirm" textContentType="newPassword" value={confirm} />
            <Button
              disabled={!canChange}
              label={t("profile.security.submit")}
              onPress={() => change.mutate()}
              testID="security-submit"
            />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
