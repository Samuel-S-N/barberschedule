import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ConfirmDialog } from "../../../src/components/domain/ConfirmDialog";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Screen } from "../../../src/components/ui/Screen";
import { getMyBarberProfile } from "../../../src/features/barbers/api";
import { endRecurrenceSeries, listMyRecurrenceSeries } from "../../../src/features/recurrence/api";
import type { MyRecurrenceSeries } from "../../../src/features/recurrence/api";
import { CancellationCard } from "../../../src/features/recurrence/CancellationCard";
import { recurrenceLabel } from "../../../src/features/recurrence/pricing";
import { RequestCard } from "../../../src/features/recurrence/RequestCard";
import { decideRecurrenceRequest, decideSeriesCancellation, listCancellationRequests, listRecurrenceRequests } from "../../../src/features/recurrence/requests-api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatDateNumeric } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function BarberRecurrenceScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const back = useBack();
  const queryClient = useQueryClient();
  const { profile, supabase } = useSupabaseSession();
  const router = useRouter();
  const language = useLanguage();
  const [ending, setEnding] = useState<MyRecurrenceSeries | null>(null);
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  // Coming back from the manual recurrence steps after creating the plan: confirm it here, once.
  useEffect(() => {
    if (!created) return;
    setFeedback({ message: t("owner.recurring.saved"), variant: "success" });
    router.setParams({ created: undefined });
  }, [created]);

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const requests = useQuery({
    enabled: Boolean(barber.data),
    queryFn: () => listRecurrenceRequests(supabase, barber.data?.shopId ?? ""),
    queryKey: ["barber-recurrence-requests", barber.data?.shopId],
  });
  const cancellations = useQuery({
    enabled: Boolean(barber.data),
    queryFn: () => listCancellationRequests(supabase, barber.data?.shopId ?? ""),
    queryKey: ["barber-recurrence-cancellations", barber.data?.shopId],
  });

  const decide = useMutation({
    mutationFn: (input: { accept: boolean; id: string }) => decideRecurrenceRequest(supabase, input.id, input.accept),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.decideError")), variant: "error" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["barber-recurrence-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
    },
  });

  const plans = useQuery({ queryFn: () => listMyRecurrenceSeries(supabase), queryKey: ["barber-recurrence-series"] });
  const activePlans = (plans.data ?? []).filter((plan) => plan.active);

  const endPlan = useMutation({
    mutationFn: (seriesId: string) => endRecurrenceSeries(supabase, seriesId),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.decideError")), variant: "error" }),
    onSettled: () => setEnding(null),
    onSuccess: () => {
      setFeedback({ message: t("recurrence.planEnded"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-recurrence-series"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-recurrence-cancellations"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
    },
  });

  const decideCancel = useMutation({
    mutationFn: (input: { accept: boolean; seriesId: string }) => decideSeriesCancellation(supabase, input.seriesId, input.accept),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.decideError")), variant: "error" }),
    onSuccess: (_data, input) => {
      setFeedback({ message: t(input.accept ? "recurrence.cancellationAccepted" : "recurrence.cancellationDeclined"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["barber-recurrence-cancellations"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("barber.hub.menu.recurrence")} />
            {requests.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {requests.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(requests.error, t, t("recurrence.decideError"))}</Text> : null}
            {requests.data && requests.data.length === 0 && (cancellations.data ?? []).length === 0 ? <EmptyState title={t("recurrence.noRequests")} /> : null}
            {(requests.data ?? []).map((request) => (
              <RequestCard busy={decide.isPending} key={request.id} onDecide={(accept) => decide.mutate({ accept, id: request.id })} request={request} />
            ))}
            {(cancellations.data ?? []).length > 0 ? (
              <View className="gap-3">
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.cancellationTitle")}</Text>
                {(cancellations.data ?? []).map((request) => (
                  <CancellationCard busy={decideCancel.isPending} key={request.seriesId} onDecide={(accept) => decideCancel.mutate({ accept, seriesId: request.seriesId })} request={request} />
                ))}
              </View>
            ) : null}

            {activePlans.length > 0 ? (
              <View className="gap-3">
                <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("recurrence.myPlansTitle")}</Text>
                <Text className="text-sm font-sans text-neutral-600">{t("recurrence.noEnd")}</Text>
                {activePlans.map((plan) => (
                  <Card key={plan.id} testID={`my-series-${plan.id}`} variant="outlined">
                    <View className="gap-2">
                      <Text className="text-base font-sans-semibold text-ink">{plan.customerName}</Text>
                      <Text className="text-sm font-sans text-neutral-600">{plan.serviceName} · {recurrenceLabel(t, plan.intervalWeeks)}</Text>
                      <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{t("recurrence.startsOn", { date: formatDateNumeric(plan.localStartDate, language) })} · {plan.localStartTime}</Text>
                      <View className="flex-row">
                        <Button disabled={endPlan.isPending} label={t("recurrence.endPlan")} onPress={() => setEnding(plan)} size="sm" testID={`my-series-end-${plan.id}`} variant="outline" />
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}

            <Button label={t("recurrence.addManual")} onPress={() => router.push("/my-profile/recurrence-manual")} size="sm" testID="recurring-manual" variant="outline" />
            <ConfirmDialog
              body={t("recurrence.endPlanBody")}
              busy={endPlan.isPending}
              cancelLabel={t("common.cancel")}
              confirmLabel={t("recurrence.endPlan")}
              onCancel={() => setEnding(null)}
              onConfirm={() => ending && endPlan.mutate(ending.id)}
              title={t("recurrence.endPlanTitle")}
              visible={ending !== null}
            />
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
