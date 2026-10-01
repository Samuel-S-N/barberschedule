import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import { deleteMyAccount } from "../../../src/features/account/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: async () => {
      await deleteMyAccount(supabase);
      await supabase.auth.signOut().catch(() => undefined);
    },
    onError: (caught) => {
      setConfirmingDelete(false);
      setError(errorMessage(caught, t, t("profile.deleteError")));
    },
    onSuccess: () => queryClient.clear(),
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.privacy.title")} />
            <Button label={t("profile.terms")} onPress={() => router.push("/legal")} variant="outline" />
            {confirmingDelete ? (
              <View className="gap-2">
                <Text className="text-base font-sans text-neutral-700">{t("profile.deleteWarning")}</Text>
                <Button disabled={remove.isPending} label={t("profile.deleteConfirm")} onPress={() => remove.mutate()} testID="profile-delete-confirm" variant="danger" />
                <Button label={t("profile.keep")} onPress={() => setConfirmingDelete(false)} variant="ghost" />
              </View>
            ) : (
              <Button label={t("profile.delete")} onPress={() => setConfirmingDelete(true)} testID="profile-delete" variant="outline" />
            )}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
