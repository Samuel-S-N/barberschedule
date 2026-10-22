import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { buildWhatsAppRecurrenceConflictUrl, listOwnerRecurrenceConflicts, resolveRecurrenceConflict } from "../../src/features/recurrence/api";
import type { RecurrenceConflict } from "../../src/features/recurrence/types";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useLanguage } from "../../src/i18n/use-language";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function RecurrenceConflictsScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const pull = useRefreshAll();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const router = useRouter();
  const { done } = useLocalSearchParams<{ done?: string }>();
  const conflicts = useQuery({
    enabled: shopId !== null,
    queryFn: () => listOwnerRecurrenceConflicts(supabase, shopId ?? ""),
    queryKey: ["owner-recurrence-conflicts", shopId],
  });

  // Coming back from the reschedule steps after a successful move: confirm it here, once.
  useEffect(() => {
    if (done !== "rescheduled") return;
    setFeedback({ message: t("owner.conflicts.rescheduled"), variant: "success" });
    router.setParams({ done: undefined });
  }, [done]);

  const resolve = useMutation({
    mutationFn: (input: { id: string }) => resolveRecurrenceConflict(supabase, { id: input.id, startsAt: null }),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("owner.conflicts.resolveError")), variant: "error" }),
    onSuccess: () => {
      setFeedback({ message: t("owner.conflicts.dismissed"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["owner-recurrence-conflicts"] });
      void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
    },
  });

  const openWhatsApp = async (conflict: RecurrenceConflict) => {
    const url = buildWhatsAppRecurrenceConflictUrl({ customerName: conflict.customerName, localDate: conflict.occurrenceDate, phone: conflict.customerPhone, serviceName: conflict.serviceName });
    if (!url) {
      setFeedback({ message: t("owner.conflicts.noPhone"), variant: "error" });
      return;
    }
    await Linking.openURL(url);
  };

  const loading = shop.isLoading || conflicts.isLoading;
  const loadError = shop.error ?? conflicts.error;
  const back = useBack();

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("owner.conflicts.back")} onBack={back} title={t("owner.conflicts.title")} />
            <Text className="text-sm font-sans text-neutral-600">{t("owner.conflicts.note")}</Text>
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.conflicts.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}
            {(conflicts.data ?? []).map((conflict: RecurrenceConflict) => {
              const open = conflict.status === "open";

              return (
                <Card key={conflict.id} testID={`conflict-${conflict.id}`} variant="outlined">
                  <View className={`gap-2 ${open ? "" : "opacity-60"}`}>
                    <Text className="text-base font-sans-semibold text-ink">{conflict.customerName} · {conflict.serviceName}</Text>
                    <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
                      {formatDateNumeric(conflict.occurrenceDate, language)} · {conflict.localStartTime} · {conflict.reason === "SLOT_UNAVAILABLE" ? t("owner.conflicts.reasonSLOT_UNAVAILABLE") : conflict.reason}
                    </Text>
                    {open ? (
                      <View className="flex-row flex-wrap gap-2">
                        <Button label={t("owner.conflicts.reschedule")} onPress={() => router.push({
                          params: { barberId: conflict.barberId, barberServiceId: conflict.barberServiceId, conflictId: conflict.id, customerName: conflict.customerName, localStartTime: conflict.localStartTime, occurrenceDate: conflict.occurrenceDate, serviceName: conflict.serviceName },
                          pathname: "/conflict-reschedule",
                        })} size="sm" testID={`conflict-reschedule-${conflict.id}`} />
                        <Button disabled={resolve.isPending} label={t("owner.conflicts.dismiss")} onPress={() => resolve.mutate({ id: conflict.id })} size="sm" testID={`conflict-dismiss-${conflict.id}`} variant="outline" />
                        <Button label={t("owner.conflicts.openWhatsApp")} onPress={() => void openWhatsApp(conflict)} size="sm" testID={`conflict-whatsapp-${conflict.id}`} variant="outline" />
                      </View>
                    ) : (
                      <Text className="text-sm font-sans-semibold text-success-700">{t("owner.conflicts.resolved")}</Text>
                    )}
                  </View>
                </Card>
              );
            })}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
