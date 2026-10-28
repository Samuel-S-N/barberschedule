import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ConfirmDialog } from "../../components/domain/ConfirmDialog";
import { EmptyState } from "../../components/domain/EmptyState";
import { NotificationActionSheet } from "../../components/domain/NotificationActionSheet";
import { ScreenHeader } from "../../components/domain/ScreenHeader";
import { SkeletonBlock } from "../../components/domain/SkeletonLoader";
import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Screen } from "../../components/ui/Screen";
import { errorMessage } from "../../i18n/errors";
import { useLanguage } from "../../i18n/use-language";
import { colors } from "../../lib/design/colors";
import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import { formatDateNumeric } from "../../lib/i18n/format";
import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { formatDayMonth } from "../payouts/format";
import { useBack } from "../../lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../lib/use-refresh";
import { useSupabaseSession } from "../../providers/AppProviders";
import { deleteNotifications, listNotifications, markRead } from "./inbox-api";
import type { InboxItem } from "./inbox-api";
import { recurrenceLabel } from "../recurrence/pricing";
import { inboxRoute } from "./inbox-route";
import { inboxText } from "./inbox-text";

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const language = useLanguage();
  const pull = useRefreshAll();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, supabase } = useSupabaseSession();
  const role = profile?.role ?? "customer";
  const back = useBack();
  const items = useQuery({ queryFn: () => listNotifications(supabase), queryKey: ["notifications", profile?.userId] });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
  };
  const read = useMutation({ mutationFn: (ids?: string[]) => markRead(supabase, ids), onSuccess: refresh });
  const [confirmAll, setConfirmAll] = useState(false);
  const [target, setTarget] = useState<InboxItem | null>(null);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const remove = useMutation({
    mutationFn: (ids?: string[]) => deleteNotifications(supabase, ids),
    onError: () => setDeleteFailed(true),
    onSettled: () => {
      setConfirmAll(false);
      setTarget(null);
    },
    onSuccess: refresh,
  });
  const unread = (items.data ?? []).filter((item) => !item.readAt);

  const open = (item: InboxItem) => {
    if (!item.readAt) read.mutate([item.id]);
    router.push(inboxRoute(item.kind, role) as never);
  };

  const when = (startsAt: string) => {
    if (!startsAt) return "";
    const local = formatInstantInShopTime(new Date(startsAt));

    return `${formatDateNumeric(local.localDate, language)} ${local.localTime}`;
  };

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1" refreshControl={pullToRefresh(pull)}>
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader
              backLabel={t("common.back")}
              onBack={back}
              right={items.data && items.data.length > 0 ? (
                <Pressable accessibilityLabel={t("notifications.clearAll")} accessibilityRole="button" className="h-11 w-11 items-center justify-center" hitSlop={8} onPress={() => setConfirmAll(true)} testID="notifications-clear">
                  <X color={colors.ink} size={24} />
                </Pressable>
              ) : null}
              title={t("notifications.title")}
            />
            {unread.length > 0 ? (
              <Button disabled={read.isPending} label={t("notifications.markAllRead")} onPress={() => read.mutate(undefined)} size="sm" testID="notifications-read-all" variant="outline" />
            ) : null}
            {items.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
            {items.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(items.error, t, t("notifications.loadError"))}</Text> : null}
            {items.data && items.data.length === 0 ? <EmptyState title={t("notifications.empty")} /> : null}
            {(items.data ?? []).map((item) => {
              const text = inboxText(item.kind);

              return (
                <Pressable accessibilityRole="button" delayLongPress={450} key={item.id} onLongPress={() => setTarget(item)} onPress={() => open(item)} testID={`notification-${item.id}`}>
                  <Card variant="outlined">
                    <View className="flex-row gap-3">
                      <View className={`w-[3px] rounded-full ${item.readAt ? "bg-transparent" : "bg-primary-500"}`} testID={item.readAt ? undefined : `notification-unread-${item.id}`} />
                      <View className="flex-1 gap-1">
                        <Text className={`text-base text-ink ${item.readAt ? "font-sans-medium" : "font-sans-semibold"}`}>{t(text.titleKey)}</Text>
                        <Text className="text-sm font-sans text-neutral-600">
                          {t(text.bodyKey, {
                            amount: item.params.amountCents === null ? "" : formatPriceBRL(item.params.amountCents),
                            barberName: item.params.barberName,
                            customerName: item.params.customerName,
                            date: item.kind === "payout_paid" ? formatDayMonth(item.params.paidOn) : when(item.params.startsAt),
                            names: item.params.barberNames,
                            label: recurrenceLabel(t, item.params.intervalWeeks ?? 1),
                            serviceName: item.params.serviceName,
                          })}
                        </Text>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
            <ConfirmDialog
              body={t("notifications.clearAllBody")}
              busy={remove.isPending}
              cancelLabel={t("common.cancel")}
              confirmLabel={t("notifications.clearAllConfirm")}
              onCancel={() => setConfirmAll(false)}
              onConfirm={() => remove.mutate(undefined)}
              title={t("notifications.clearAll")}
              visible={confirmAll}
            />
            <NotificationActionSheet busy={remove.isPending} deleteLabel={t("notifications.deleteOne")} onClose={() => setTarget(null)} onDelete={() => target && remove.mutate([target.id])} visible={target !== null} />
            <Toast message={t("notifications.deleteError")} onDismiss={() => setDeleteFailed(false)} variant="error" visible={deleteFailed} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
