import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Avatar } from "../../../src/components/domain/Avatar";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Input, useFieldChain } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { changeEmail, updateMyStaffProfile, uploadMyAvatar } from "../../../src/features/account/api";
import { base64ToArrayBuffer, validateAvatar } from "../../../src/features/account/avatar";
import { isValidEmail } from "../../../src/features/account/security";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Feedback = { message: string; variant: "error" | "success" };

export default function OwnerAccountScreen() {
  const { t } = useTranslation();
  const field = useFieldChain(2);
  const back = useBack("/settings");
  const queryClient = useQueryClient();
  const { session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const [fullName, setFullName] = useState("");
  const [nickname, setNickname] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const fail = (caught: unknown, fallback: string) => setFeedback({ message: errorMessage(caught, t, fallback), variant: "error" });

  useEffect(() => {
    setFullName(profile.data?.fullName ?? "");
    setNickname(profile.data?.nickname ?? "");
  }, [profile.data?.fullName, profile.data?.nickname]);

  const save = useMutation({
    mutationFn: () => updateMyStaffProfile(supabase, { fullName, nickname }),
    onError: (caught) => fail(caught, t("profile.saveError")),
    onSuccess: () => {
      setFeedback({ message: t("profile.saved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const photo = useMutation({
    mutationFn: async () => {
      // No permission request: the system photo pickers work without one.
      const picked = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"] });

      if (picked.canceled) return "canceled" as const;

      // Always a small JPEG taken from the manipulator (fetch().arrayBuffer() returns broken data on React Native).
      const small = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 512 } }], {
        base64: true, compress: 0.8, format: ImageManipulator.SaveFormat.JPEG,
      });
      const data = base64ToArrayBuffer(small.base64 ?? "");

      if (validateAvatar({ size: data.byteLength, type: "image/jpeg" })) return "invalid" as const;

      await uploadMyAvatar(supabase, session!.user.id, data, "image/jpeg", profile.data?.avatarPath ?? null);

      return "saved" as const;
    },
    onError: (caught) => fail(caught, t("profile.account.photoError")),
    onSuccess: (result) => {
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
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("profile.account.title")} />
            <View className="items-center gap-2 py-2">
              <Avatar accessibilityLabel={t("profile.account.changePhoto")} busy={photo.isPending} name={profile.data?.fullName} onPress={() => photo.mutate()} testID="account-avatar" uri={profile.data?.avatarUrl} />
              <Button label={t("profile.account.changePhoto")} onPress={() => photo.mutate()} size="sm" variant="ghost" />
            </View>

            <Input {...field(0)} label={t("common.fullName")} onChangeText={setFullName} testID="owner-full-name" value={fullName} />
            <Input {...field(1)} autoCapitalize="words" label={t("common.nicknameOptional")} onChangeText={setNickname} testID="owner-nickname" value={nickname} />

            <Text className="pt-2 text-sm font-sans-medium text-neutral-600">{t("profile.account.emailLabel")}</Text>
            <Text className="text-base font-sans text-ink" testID="account-email">{session?.user.email}</Text>
            {changingEmail ? (
              <View className="gap-2">
                <Input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  error={newEmail && !isValidEmail(newEmail) ? t("profile.account.emailInvalid") : undefined}
                  keyboardType="email-address"
                  label={t("profile.account.newEmail")}
                  onChangeText={setNewEmail}
                  testID="account-new-email"
                  textContentType="emailAddress"
                  value={newEmail}
                />
                <Button disabled={email.isPending || !isValidEmail(newEmail)} label={t("profile.account.sendLink")} onPress={() => email.mutate()} testID="account-send-link" />
                <Button label={t("common.cancel")} onPress={() => setChangingEmail(false)} variant="ghost" />
              </View>
            ) : (
              <Button label={t("profile.account.changeEmail")} onPress={() => setChangingEmail(true)} testID="account-change-email" variant="outline" />
            )}

            <Button disabled={save.isPending || fullName.trim().length === 0} label={t("owner.profile.save")} onPress={() => save.mutate()} testID="owner-save" />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
