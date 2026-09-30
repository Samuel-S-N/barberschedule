import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { changePassword } from "../../../src/features/account/api";
import { validateNewPassword } from "../../../src/features/account/security";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { createPasswordCheckClient } from "../../../src/lib/supabase/client";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function SecurityScreen() {
  const { t } = useTranslation();
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
    onError: (caught) => setFeedback({ message: errorMessage(caught, t as never, t("profile.security.error")), variant: "error" }),
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

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.security.title")} />
            <Input label={t("profile.security.current")} onChangeText={setCurrent} secureTextEntry testID="security-current" value={current} />
            <Input label={t("profile.security.next")} onChangeText={setNext} secureTextEntry testID="security-next" value={next} />
            <Input error={problemText} label={t("profile.security.confirm")} onChangeText={setConfirm} secureTextEntry testID="security-confirm" value={confirm} />
            <Button
              disabled={change.isPending || !current || !next || validateNewPassword(next, confirm) !== null}
              label={t("profile.security.submit")}
              onPress={() => change.mutate()}
              testID="security-submit"
            />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
