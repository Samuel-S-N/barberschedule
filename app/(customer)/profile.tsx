import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { buildExportFile, deleteMyAccount, exportMyData, updateMyProfile } from "../../src/features/account/api";
import { saveExportFile } from "../../src/features/account/export-file";
import { signOut } from "../../src/features/auth/api";
import { listMyCustomers } from "../../src/features/customers/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function CustomerProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { session, supabase } = useSupabaseSession();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const customer = customers.data?.[0];
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const fail = (caught: unknown, fallback: string) =>
    setFeedback({ message: errorMessage(caught, t as never, fallback), variant: "error" });

  useEffect(() => {
    if (customer) {
      setFullName(customer.fullName);
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  const save = useMutation({
    mutationFn: () => updateMyProfile(supabase, { fullName, phone: phone.trim() || null }),
    onError: (caught) => fail(caught, t("profile.saveError")),
    onSuccess: () => {
      setFeedback({ message: t("profile.saved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-customers"] });
    },
  });
  const exportData = useMutation({
    mutationFn: async () => saveExportFile(buildExportFile(await exportMyData(supabase))),
    onError: (caught) => fail(caught, t("profile.exportError")),
    onSuccess: () => setFeedback({ message: t("profile.exportReady"), variant: "success" }),
  });
  const remove = useMutation({
    mutationFn: async () => {
      await deleteMyAccount(supabase);
      await supabase.auth.signOut().catch(() => undefined);
    },
    onSuccess: () => queryClient.clear(),
    onError: (caught) => {
      setConfirmingDelete(false);
      fail(caught, t("profile.deleteError"));
    },
  });

  return (
    <Screen edges={["top", "left", "right"]} className="flex-1 bg-canvas">
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <Text accessibilityRole="header" className="text-3xl font-display-bold text-ink">{t("profile.title")}</Text>
            <Text className="text-sm font-sans text-neutral-600">{session?.user.email}</Text>
            <Input label={t("common.fullName")} onChangeText={setFullName} testID="profile-name" value={fullName} />
            <Input label={t("common.phoneOptional")} onChangeText={setPhone} testID="profile-phone" value={phone} />
            <Button disabled={save.isPending || !customer} label={t("profile.save")} onPress={() => save.mutate()} testID="profile-save" />

            <Text className="pt-2 text-lg font-display-semibold text-ink">{t("profile.yourData")}</Text>
            <Button
              disabled={exportData.isPending}
              label={t("profile.download")}
              onPress={() => exportData.mutate()}
              testID="profile-export"
              variant="outline"
            />
            <Button label={t("profile.terms")} onPress={() => router.push("/legal")} variant="ghost" />

            {confirmingDelete ? (
              <View className="gap-2">
                <Text className="text-base font-sans text-neutral-700">{t("profile.deleteWarning")}</Text>
                <Button
                  disabled={remove.isPending}
                  label={t("profile.deleteConfirm")}
                  onPress={() => remove.mutate()}
                  testID="profile-delete-confirm"
                  variant="danger"
                />
                <Button label={t("profile.keep")} onPress={() => setConfirmingDelete(false)} variant="ghost" />
              </View>
            ) : (
              <Button label={t("profile.delete")} onPress={() => setConfirmingDelete(true)} testID="profile-delete" variant="outline" />
            )}

            <Toast
              message={feedback?.message ?? ""}
              onDismiss={() => setFeedback(null)}
              variant={feedback?.variant ?? "info"}
              visible={feedback !== null}
            />
            <Button
              label={t("profile.signOut")}
              onPress={async () => {
                try {
                  await signOut(supabase);
                } catch (caught) {
                  fail(caught, t("profile.signOutError"));
                }
              }}
              variant="dark"
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
