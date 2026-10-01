import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { signOut } from "../../src/features/auth/api";
import { getMyBarberProfile, listMyBarberServices, updateMyBarberProfile } from "../../src/features/barbers/api";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function BarberProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile, supabase } = useSupabaseSession();
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const services = useQuery({ queryFn: () => listMyBarberServices(supabase), queryKey: ["my-barber-services"] });

  useEffect(() => {
    if (barber.data) {
      setBio(barber.data.bio ?? "");
      setAvatarUrl(barber.data.avatarUrl ?? "");
    }
  }, [barber.data]);

  const save = useMutation({
    mutationFn: () => updateMyBarberProfile(supabase, { avatarUrl, bio }),
    onError: () => setFeedback({ message: t("barber.profile.saveError"), variant: "error" }),
    onSuccess: () => {
      setFeedback({ message: t("barber.profile.saved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-barber-profile"] });
    },
  });

  const signOutMutation = useMutation({
    mutationFn: () => signOut(supabase),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("profile.signOutError")), variant: "error" }),
  });

  const compensation = barber.data?.compensation;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" className="flex-1">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">
            {barber.data?.name ?? t("barber.profile.title")}
          </Text>
          <View className="w-full max-w-[420px] gap-3">
            {barber.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {barber.error ? (
              <Text className="text-sm font-sans text-danger-500">{errorMessage(barber.error, t, t("barber.profile.loadError"))}</Text>
            ) : null}
            {barber.data ? (
              <>
                <Input label={t("barber.profile.bio")} multiline onChangeText={setBio} testID="barber-bio" value={bio} />
                <Input label={t("barber.profile.avatarUrl")} onChangeText={setAvatarUrl} placeholder={"https://"} testID="barber-avatar" value={avatarUrl} />
                <Button disabled={save.isPending} label={t("barber.profile.save")} onPress={() => save.mutate()} testID="barber-save" />
              </>
            ) : null}
          </View>

          <View className="w-full max-w-[420px] gap-3">
            <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">
              {t("barber.profile.servicesTitle")}
            </Text>
            {services.data?.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("barber.profile.noServices")}</Text> : null}
            {(services.data ?? []).map((service) => (
              <Card key={service.barberServiceId} variant="outlined">
                <Text className="text-base font-sans-semibold text-ink">
                  {service.serviceName} {service.active ? "" : t("barber.profile.inactive")}
                </Text>
                <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                  {t("barber.profile.serviceLine", { duration: service.durationMinutes, price: formatPriceBRL(service.priceCents) })}
                </Text>
              </Card>
            ))}
          </View>

          {compensation ? (
            <View className="w-full max-w-[420px] gap-2">
              <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">
                {t("barber.profile.compensationTitle")}
              </Text>
              <Text className="text-base font-sans text-neutral-700" testID="barber-compensation">
                {compensation.type === "commission"
                  ? t("barber.profile.commission", { percent: compensation.commissionPercent })
                  : t("barber.profile.chairRental", {
                      amount: formatPriceBRL(compensation.amountCents),
                      frequency: t(`barber.frequency.${compensation.frequency}`),
                    })}
              </Text>
            </View>
          ) : null}

          <View className="w-full max-w-[420px]">
            <Button label={t("common.signOut")} onPress={() => signOutMutation.mutate()} testID="barber-sign-out" variant="outline" />
          </View>
          <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
