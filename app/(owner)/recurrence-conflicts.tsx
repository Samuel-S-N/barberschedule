import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, ScrollView, Text, View } from "react-native";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Screen } from "../../src/components/ui/Screen";
import { buildWhatsAppRecurrenceConflictUrl, listOwnerRecurrenceConflicts } from "../../src/features/recurrence/api";
import type { RecurrenceConflict } from "../../src/features/recurrence/types";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function RecurrenceConflictsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [feedback, setFeedback] = useState<string | null>(null);
  const conflicts = useQuery({
    enabled: shopId !== null,
    queryFn: () => listOwnerRecurrenceConflicts(supabase, shopId ?? ""),
    queryKey: ["owner-recurrence-conflicts", shopId],
  });

  const openWhatsApp = async (conflict: RecurrenceConflict) => {
    const url = buildWhatsAppRecurrenceConflictUrl({ customerName: conflict.customerName, localDate: conflict.occurrenceDate, phone: conflict.customerPhone, serviceName: conflict.serviceName });
    if (!url) {
      setFeedback(t("owner.conflicts.noPhone"));
      return;
    }
    await Linking.openURL(url);
  };

  const loading = shop.isLoading || conflicts.isLoading;
  const loadError = shop.error ?? conflicts.error;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/monthly-customers"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("owner.conflicts.back")} onBack={back} title={t("owner.conflicts.title")} />
            <Text className="text-sm font-sans text-neutral-600">{t("owner.conflicts.note")}</Text>
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.conflicts.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}
            {(conflicts.data ?? []).map((conflict: RecurrenceConflict) => (
              <Card key={conflict.id} testID={`conflict-${conflict.id}`} variant="outlined">
                <View className="gap-2">
                  <Text className="text-base font-sans-semibold text-ink">{conflict.customerName} · {conflict.serviceName}</Text>
                  <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{conflict.occurrenceDate} · {conflict.localStartTime} · {conflict.reason} · {conflict.status}</Text>
                  <Button label={t("owner.conflicts.openWhatsApp")} onPress={() => void openWhatsApp(conflict)} size="sm" testID={`conflict-whatsapp-${conflict.id}`} variant="outline" />
                </View>
              </Card>
            ))}
            <Toast message={feedback ?? ""} onDismiss={() => setFeedback(null)} variant="error" visible={feedback !== null} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
