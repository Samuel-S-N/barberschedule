import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { deleteBarberPayout, getPayoutOverview, listBarberPayouts, recordBarberPayout } from "../../src/features/payouts/api";
import { PayoutCard } from "../../src/features/payouts/owner/PayoutCard";
import { PayoutForm } from "../../src/features/payouts/owner/PayoutForm";
import { PayoutHistory } from "../../src/features/payouts/owner/PayoutHistory";
import { errorMessage } from "../../src/i18n/errors";
import { addLocalDays } from "../../src/lib/dates/calendar-strip-days";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useBack } from "../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerPayoutsScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const pull = useRefreshAll();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const today = formatInstantInShopTime(new Date()).localDate;
  const [payingId, setPayingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  const overview = useQuery({ queryFn: () => getPayoutOverview(supabase), queryKey: ["payout-overview"] });
  const history = useQuery({ queryFn: () => listBarberPayouts(supabase, addLocalDays(today, -89), today), queryKey: ["payout-history", today] });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["payout-overview"] });
    void queryClient.invalidateQueries({ queryKey: ["payout-history"] });
  };

  const record = useMutation({
    mutationFn: (input: { amountCents: number; barberId: string; note: string; paidOn: string }) => recordBarberPayout(supabase, input),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("errors.codes.PAYOUT_INVALID")), variant: "error" }),
    onSuccess: () => {
      setPayingId(null);
      setFeedback({ message: t("payouts.recorded"), variant: "success" });
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteBarberPayout(supabase, id),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("errors.codes.PAYOUT_INVALID")), variant: "error" }),
    onSuccess: () => {
      setFeedback({ message: t("payouts.removed"), variant: "success" });
      refresh();
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1" refreshControl={pullToRefresh(pull)}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("payouts.title")} />
            {feedback ? <Text className={`text-sm font-sans ${feedback.variant === "error" ? "text-danger-500" : "text-success-500"}`} testID="payouts-feedback">{feedback.message}</Text> : null}
            {overview.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {overview.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(overview.error, t, t("payouts.empty"))}</Text> : null}
            {overview.data?.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("payouts.empty")}</Text> : null}
            {overview.data?.map((item) => (
              <View key={item.barberId} className="gap-2">
                <PayoutCard item={item} onPay={() => setPayingId(item.barberId)} />
                {payingId === item.barberId ? (
                  <Card variant="outlined">
                    <PayoutForm balanceCents={item.balanceCents} busy={record.isPending} onCancel={() => setPayingId(null)} onSubmit={(input) => record.mutate({ ...input, barberId: item.barberId })} today={today} />
                  </Card>
                ) : null}
              </View>
            ))}
            <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("payouts.history")}</Text>
            <PayoutHistory items={history.data ?? []} onDelete={(id) => remove.mutate(id)} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
