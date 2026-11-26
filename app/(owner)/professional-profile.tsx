import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Avatar } from "../../src/components/domain/Avatar";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { inviteProfessional, setProfessionalActive, updateProfessional } from "../../src/features/professionals/api";
import { ProfessionalServicesEditor } from "../../src/features/professionals/owner/ProfessionalServicesEditor";
import { CompensationEditor } from "../../src/features/professionals/owner/CompensationEditor";
import { useOwnerProfessionals } from "../../src/features/professionals/owner/use-owner-professionals";
import { errorMessage } from "../../src/i18n/errors";
import { useFromSetup } from "../../src/features/setup/from-setup";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function OwnerProfessionalProfileScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { professionals } = useOwnerProfessionals();
  const professional = professionals.data?.list.find((candidate) => candidate.id === id) ?? null;
  const signedIn = professional ? Boolean(professionals.data?.signedIn[professional.id]) : false;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const notify = (message: string, variant: "error" | "success") => setFeedback({ message, variant });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-professionals"] });

  useEffect(() => setName(professional?.name ?? ""), [professional?.name]);

  const { returnToSetup } = useFromSetup();
  const rename = useMutation({
    mutationFn: () => updateProfessional(supabase, id, { name }),
    onError: (error) => notify(errorMessage(error, t, t("owner.professionals.saveError")), "error"),
    onSuccess: () => {
      notify(t("owner.professionals.saved"), "success");
      void refresh();
      returnToSetup();
    },
  });

  const [inviteStatus, setInviteStatus] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const invite = useMutation({
    mutationFn: (address: string) => inviteProfessional(supabase, { professionalId: id, email: address }),
    // A message that stays until the next attempt (a toast fades after 3 s and was easy to miss).
    onError: (error) => setInviteStatus({ message: errorMessage(error, t, t("owner.professionals.inviteError")), variant: "error" }),
    onSuccess: (_result, variables) => {
      setInviteEmail("");
      setInviteStatus({ message: t("owner.professionals.inviteSentTo", { email: variables }), variant: "success" });
      void refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => setProfessionalActive(supabase, id, active),
    onError: (error) => notify(errorMessage(error, t, t("owner.professionals.updateError")), "error"),
    onSuccess: (_result, active) => {
      void refresh();
      if (!active) back();
    },
  });

  const status = !professional?.userId ? "owner.professionals.statusNone" : signedIn ? "owner.professionals.statusActive" : "owner.professionals.statusInvited";

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.professionals.profileTitle")} />
            {professionals.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {professionals.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(professionals.error, t, t("owner.professionals.loadError"))}</Text> : null}
            {professionals.data && !professional ? <EmptyState title={t("owner.professionals.notFound")} /> : null}

            {professional ? (
              <>
                <View className="items-center gap-1">
                  <Avatar name={professional.name} size={72} uri={professional.avatarUrl} />
                  <Text accessibilityRole="header" className="pt-2 text-2xl font-display-bold text-ink">{professional.name}{professional.active ? "" : ` ${t("common.archived")}`}</Text>
                  <Text className="text-sm font-sans text-neutral-600">{t(status)}</Text>
                </View>

                <Card variant="outlined">
                  <View className="gap-3">
                    <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.professionals.dataTitle")}</Text>
                    <Input label={t("owner.professionals.nameLabel")} onChangeText={setName} placeholder={t("examples.fullName")} testID="professional-name-input" value={name} />
                    <Button disabled={rename.isPending || name.trim().length === 0 || name.trim() === professional.name} label={t("owner.professionals.save")} onPress={() => rename.mutate()} size="sm" testID="professional-save" />
                  </View>
                </Card>

                {!professional.userId ? (
                  <Card variant="outlined">
                    <View className="gap-3">
                      <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.professionals.accessTitle")}</Text>
                      <Input autoCapitalize="none" keyboardType="email-address" label={t("owner.professionals.inviteEmailLabel")} onChangeText={setInviteEmail} placeholder={t("examples.email")} testID="professional-invite-email" value={inviteEmail} />
                      <Button disabled={invite.isPending || !inviteEmail.includes("@")} label={t("owner.professionals.sendInvite")} onPress={() => { setInviteStatus(null); invite.mutate(inviteEmail.trim()); }} size="sm" testID="professional-invite-send" />
                      {inviteStatus ? <Text accessibilityLiveRegion="polite" className={`text-sm font-sans-medium ${inviteStatus.variant === "error" ? "text-danger-500" : "text-success-500"}`} testID="professional-invite-status">{inviteStatus.message}</Text> : null}
                    </View>
                  </Card>
                ) : null}

                <CompensationEditor professional={professional} onFeedback={notify} />
                <ProfessionalServicesEditor professional={professional} onFeedback={notify} />

                <Button
                  disabled={toggle.isPending}
                  label={professional.active ? t("common.deactivate") : t("common.activate")}
                  onPress={() => toggle.mutate(!professional.active)}
                  testID="professional-toggle"
                  variant={professional.active ? "danger" : "primary"}
                />
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
