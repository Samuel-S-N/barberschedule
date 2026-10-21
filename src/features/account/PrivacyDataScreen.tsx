import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { Screen } from "../../components/ui/Screen";
import { errorMessage } from "../../i18n/errors";
import { useBack } from "../../lib/navigation/use-back";
import { useSupabaseSession } from "../../providers/AppProviders";
import { buildExportFile, deleteMyAccount, exportMyData } from "./api";
import { saveExportFile } from "./export-file";

type Props = {
  // Owners cannot delete the account from the app (it would erase the shop): they see `note` instead.
  allowDelete: boolean;
  note?: string;
};

// Privacy and data is the same for every role: terms, data download and (client / barber) account deletion.
export function PrivacyDataScreen({ allowDelete, note }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  const exportData = useMutation({
    mutationFn: async () => saveExportFile(buildExportFile(await exportMyData(supabase))),
    onError: (caught) => setFeedback({ message: errorMessage(caught, t, t("profile.exportError")), variant: "error" }),
    onSuccess: () => setFeedback({ message: t("profile.exportReady"), variant: "success" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await deleteMyAccount(supabase);
      await supabase.auth.signOut().catch(() => undefined);
    },
    onError: (caught) => {
      setConfirmingDelete(false);
      setFeedback({ message: errorMessage(caught, t, t("profile.deleteError")), variant: "error" });
    },
    onSuccess: () => queryClient.clear(),
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.privacy.title")} />
            <Button label={t("profile.terms")} onPress={() => router.push("/legal")} testID="privacy-terms" variant="outline" />
            <Button disabled={exportData.isPending} label={t("profile.download")} onPress={() => exportData.mutate()} testID="profile-export" variant="outline" />
            {allowDelete ? (
              confirmingDelete ? (
                <View className="gap-2">
                  <Text className="text-base font-sans text-neutral-700">{t("profile.deleteWarning")}</Text>
                  <Button disabled={remove.isPending} label={t("profile.deleteConfirm")} onPress={() => remove.mutate()} testID="profile-delete-confirm" variant="danger" />
                  <Button label={t("profile.keep")} onPress={() => setConfirmingDelete(false)} variant="ghost" />
                </View>
              ) : (
                <Button label={t("profile.delete")} onPress={() => setConfirmingDelete(true)} testID="profile-delete" variant="outline" />
              )
            ) : note ? (
              <Text className="text-base font-sans text-neutral-700" testID="owner-privacy-note">{note}</Text>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
