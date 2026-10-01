import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { changeEmail, uploadMyAvatar } from "../../../src/features/account/api";
import { AVATAR_BUCKET, base64ToArrayBuffer, validateAvatar } from "../../../src/features/account/avatar";
import { isValidEmail } from "../../../src/features/account/security";
import { useMyProfile } from "../../../src/features/account/use-my-profile";
import { getMyBarberProfile, updateMyBarberProfile } from "../../../src/features/barbers/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

type Feedback = { message: string; variant: "error" | "success" };

export default function BarberAccountScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const queryClient = useQueryClient();
  const { profile: sessionProfile, session, supabase } = useSupabaseSession();
  const profile = useMyProfile();
  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", sessionProfile?.userId] });
  const [bio, setBio] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const fail = (caught: unknown, fallback: string) => setFeedback({ message: errorMessage(caught, t, fallback), variant: "error" });

  useEffect(() => setBio(barber.data?.bio ?? ""), [barber.data?.bio]);

  const save = useMutation({
    mutationFn: () => updateMyBarberProfile(supabase, { avatarUrl: barber.data?.avatarUrl ?? null, bio }),
    onError: (caught) => fail(caught, t("barber.profile.saveError")),
    onSuccess: () => {
      setFeedback({ message: t("barber.profile.saved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-barber-profile"] });
    },
  });

  const photo = useMutation({
    mutationFn: async () => {
      // No permission request: the system photo pickers work without one.
      const picked = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], mediaTypes: ["images"] });

      if (picked.canceled) return "canceled" as const;

      // Always a small JPEG, with its bytes taken from the manipulator: fetch().arrayBuffer() returns
      // broken data on React Native (a 14-byte "photo").
      const small = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 512 } }], {
        base64: true, compress: 0.8, format: ImageManipulator.SaveFormat.JPEG,
      });
      const data = base64ToArrayBuffer(small.base64 ?? "");

      if (validateAvatar({ size: data.byteLength, type: "image/jpeg" })) return "invalid" as const;

      const path = await uploadMyAvatar(supabase, session!.user.id, data, "image/jpeg", profile.data?.avatarPath ?? null);
      // Customers see the barber card photo from barbers.avatar_url, so keep it in step with the profile photo.
      const publicUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      await updateMyBarberProfile(supabase, { avatarUrl: publicUrl, bio: barber.data?.bio ?? null });

      return "saved" as const;
    },
    onError: (caught) => fail(caught, t("profile.account.photoError")),
    onSuccess: (result) => {
      if (result === "invalid") setFeedback({ message: t("profile.account.photoInvalid"), variant: "error" });
      if (result === "saved") {
        void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
        void queryClient.invalidateQueries({ queryKey: ["my-barber-profile"] });
      }
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
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("barber.hub.menu.account")} />
            <View className="items-center gap-2 py-2">
              <Avatar
                accessibilityLabel={t("profile.account.changePhoto")}
                busy={photo.isPending}
                name={barber.data?.name}
                onPress={() => photo.mutate()}
                testID="account-avatar"
                uri={profile.data?.avatarUrl ?? barber.data?.avatarUrl}
              />
              <Button label={t("profile.account.changePhoto")} onPress={() => photo.mutate()} size="sm" variant="ghost" />
            </View>

            <View className="gap-1">
              <Text className="text-sm font-sans-medium text-neutral-600">{t("common.fullName")}</Text>
              <Text className="text-base font-sans text-ink" testID="barber-name">{barber.data?.name}</Text>
              <Text className="text-xs font-sans text-neutral-600">{t("barber.account.nameHint")}</Text>
            </View>

            <Input label={t("barber.profile.bio")} multiline onChangeText={setBio} testID="barber-bio" value={bio} />
            <Text className="-mt-2 text-xs font-sans text-neutral-600">{t("barber.account.bioHint")}</Text>
            <Button disabled={save.isPending || !barber.data} label={t("barber.profile.save")} onPress={() => save.mutate()} testID="barber-save" />

            <Text className="pt-2 text-sm font-sans-medium text-neutral-600">{t("profile.account.emailLabel")}</Text>
            <Text className="text-base font-sans text-ink" testID="account-email">{session?.user.email}</Text>
            {changingEmail ? (
              <View className="gap-2">
                <Input
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
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
      </KeyboardAwareScrollView>
    </Screen>
  );
}
