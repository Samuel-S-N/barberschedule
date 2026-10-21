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
import { inviteBarber, setBarberActive, updateBarber } from "../../src/features/barbers/api";
import { BarberServicesEditor } from "../../src/features/barbers/owner/BarberServicesEditor";
import { CompensationEditor } from "../../src/features/barbers/owner/CompensationEditor";
import { useOwnerBarbers } from "../../src/features/barbers/owner/use-owner-barbers";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function OwnerBarberProfileScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { barbers } = useOwnerBarbers();
  const barber = barbers.data?.list.find((candidate) => candidate.id === id) ?? null;
  const signedIn = barber ? Boolean(barbers.data?.signedIn[barber.id]) : false;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const notify = (message: string, variant: "error" | "success") => setFeedback({ message, variant });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-barbers"] });

  useEffect(() => setName(barber?.name ?? ""), [barber?.name]);

  const rename = useMutation({
    mutationFn: () => updateBarber(supabase, id, { name }),
    onError: (error) => notify(errorMessage(error, t, t("owner.barbers.saveError")), "error"),
    onSuccess: () => {
      notify(t("owner.barbers.saved"), "success");
      void refresh();
    },
  });

  const invite = useMutation({
    mutationFn: () => inviteBarber(supabase, { barberId: id, email: inviteEmail.trim() }),
    onError: (error) => notify(errorMessage(error, t, t("owner.barbers.inviteError")), "error"),
    onSuccess: () => {
      setInviteEmail("");
      notify(t("owner.barbers.inviteSent"), "success");
      void refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (active: boolean) => setBarberActive(supabase, id, active),
    onError: (error) => notify(errorMessage(error, t, t("owner.barbers.updateError")), "error"),
    onSuccess: (_result, active) => {
      void refresh();
      if (!active) back();
    },
  });

  const status = !barber?.userId ? "owner.barbers.statusNone" : signedIn ? "owner.barbers.statusActive" : "owner.barbers.statusInvited";

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.barbers.profileTitle")} />
            {barbers.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {barbers.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(barbers.error, t, t("owner.barbers.loadError"))}</Text> : null}
            {barbers.data && !barber ? <EmptyState title={t("owner.barbers.notFound")} /> : null}

            {barber ? (
              <>
                <View className="items-center gap-1">
                  <Avatar name={barber.name} size={72} uri={barber.avatarUrl} />
                  <Text accessibilityRole="header" className="pt-2 text-2xl font-display-bold text-ink">{barber.name}{barber.active ? "" : ` ${t("common.archived")}`}</Text>
                  <Text className="text-sm font-sans text-neutral-600">{t(status)}</Text>
                </View>

                <Card variant="outlined">
                  <View className="gap-3">
                    <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.barbers.dataTitle")}</Text>
                    <Input label={t("owner.barbers.nameLabel")} onChangeText={setName} testID="barber-name-input" value={name} />
                    <Button disabled={rename.isPending || name.trim().length === 0 || name.trim() === barber.name} label={t("owner.barbers.save")} onPress={() => rename.mutate()} size="sm" testID="barber-save" />
                  </View>
                </Card>

                {!barber.userId ? (
                  <Card variant="outlined">
                    <View className="gap-3">
                      <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("owner.barbers.accessTitle")}</Text>
                      <Input autoCapitalize="none" keyboardType="email-address" label={t("owner.barbers.inviteEmailLabel")} onChangeText={setInviteEmail} testID="barber-invite-email" value={inviteEmail} />
                      <Button disabled={invite.isPending || !inviteEmail.includes("@")} label={t("owner.barbers.sendInvite")} onPress={() => invite.mutate()} size="sm" testID="barber-invite-send" />
                    </View>
                  </Card>
                ) : null}

                <CompensationEditor barber={barber} onFeedback={notify} />
                <BarberServicesEditor barber={barber} onFeedback={notify} />

                <Button
                  disabled={toggle.isPending}
                  label={barber.active ? t("common.deactivate") : t("common.activate")}
                  onPress={() => toggle.mutate(!barber.active)}
                  testID="barber-toggle"
                  variant={barber.active ? "danger" : "primary"}
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
