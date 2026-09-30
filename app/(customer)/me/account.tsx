import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { changeEmail, updateMyProfile, uploadMyAvatar } from "../../../src/features/account/api";
import { validateAvatar } from "../../../src/features/account/avatar";
import { isValidEmail } from "../../../src/features/account/security";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { listMyCustomers } from "../../../src/features/customers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Feedback = { message: string; variant: "error" | "success" };

export default function AccountScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const queryClient = useQueryClient();
  const { session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const customers = useQuery({ queryFn: () => listMyCustomers(supabase), queryKey: ["my-customers"] });
  const customer = customers.data?.[0];
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
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
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const photo = useMutation({
    mutationFn: async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) return "permission" as const;

      const picked = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"], quality: 0.7,
      });

      if (picked.canceled) return "canceled" as const;

      const blob = await (await fetch(picked.assets[0].uri)).blob();

      if (validateAvatar(blob)) return "invalid" as const;

      await uploadMyAvatar(supabase, session!.user.id, blob, profile.data?.avatarUrl ?? null);

      return "saved" as const;
    },
    onError: (caught) => fail(caught, t("profile.account.photoError")),
    onSuccess: (result) => {
      if (result === "permission") setFeedback({ message: t("profile.account.photoPermission"), variant: "error" });
      if (result === "invalid") setFeedback({ message: t("profile.account.photoInvalid"), variant: "error" });
      if (result === "saved") void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const email = useMutation({
    mutationFn: () => changeEmail(supabase, newEmail),
    onError: (caught) => fail(caught, t("profile.account.emailError")),
    onSuccess: () => {
      setFeedback({ message: t("profile.account.emailSent", { email: newEmail.trim() }), variant: "success" });
      setChangingEmail(false);
      setNewEmail("");
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.account.title")} />
            <View className="items-center gap-2 py-2">
              <Avatar
                accessibilityLabel={t("profile.account.changePhoto")}
                busy={photo.isPending}
                name={fullName}
                onPress={() => photo.mutate()}
                testID="account-avatar"
                uri={profile.data?.avatarUrl}
              />
              <Button label={t("profile.account.changePhoto")} onPress={() => photo.mutate()} size="sm" variant="ghost" />
            </View>

            <Input label={t("common.fullName")} onChangeText={setFullName} testID="profile-name" value={fullName} />
            <Input label={t("common.phoneOptional")} onChangeText={setPhone} testID="profile-phone" value={phone} />
            <Button disabled={save.isPending || !customer} label={t("profile.save")} onPress={() => save.mutate()} testID="profile-save" />

            <Text className="pt-2 text-sm font-sans-medium text-neutral-600">{t("profile.account.emailLabel")}</Text>
            <Text className="text-base font-sans text-ink" testID="account-email">{session?.user.email}</Text>
            {changingEmail ? (
              <View className="gap-2">
                <Input
                  error={newEmail && !isValidEmail(newEmail) ? t("profile.account.emailInvalid") : undefined}
                  label={t("profile.account.newEmail")}
                  onChangeText={setNewEmail}
                  testID="account-new-email"
                  value={newEmail}
                />
                <Button
                  disabled={email.isPending || !isValidEmail(newEmail)}
                  label={t("profile.account.sendLink")}
                  onPress={() => email.mutate()}
                  testID="account-send-link"
                />
                <Button label={t("common.cancel")} onPress={() => setChangingEmail(false)} variant="ghost" />
              </View>
            ) : (
              <Button label={t("profile.account.changeEmail")} onPress={() => setChangingEmail(true)} testID="account-change-email" variant="outline" />
            )}

            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
