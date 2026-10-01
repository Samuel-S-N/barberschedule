import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { MessageCircle, Phone } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Avatar } from "../../../src/components/domain/Avatar";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { StatTile } from "../../../src/components/domain/StatTile";
import { StatusBadge } from "../../../src/components/domain/StatusBadge";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { getMyClient, setMyClientNote } from "../../../src/features/clients/api";
import { telUrl, whatsappUrl } from "../../../src/features/clients/format";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { colors } from "../../../src/lib/design/colors";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateLabel } from "../../../src/lib/i18n/format";
import { useBack } from "../../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

function ContactLink({ children, icon: Icon, testID, url }: { children: string; icon: typeof Phone; testID: string; url: string | null }) {
  const body = (
    <View className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-full border border-neutral-200 bg-surface px-4 ${url ? "" : "opacity-50"}`}>
      <Icon color={colors.primary[600]} size={18} />
      <Text className="text-sm font-sans-semibold text-ink">{children}</Text>
    </View>
  );

  if (!url) return <View className="flex-1" testID={testID}>{body}</View>;

  // On the web a real anchor keeps the link openable in a new tab; on native Linking hands it to WhatsApp or the dialer.
  const linkProps = Platform.OS === "web"
    ? ({ href: url, hrefAttrs: { rel: "noopener noreferrer", target: "_blank" } } as object)
    : { onPress: () => void Linking.openURL(url) };

  return (
    <Pressable accessibilityRole="link" className="flex-1" testID={testID} {...linkProps}>
      {body}
    </Pressable>
  );
}

function Line({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="text-sm font-sans text-neutral-600">{label}</Text>
      <Text className="flex-1 text-right text-sm font-sans-medium text-ink">{children}</Text>
    </View>
  );
}

export default function ClientDetailScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const language = useLanguage();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const client = useQuery({ enabled: Boolean(id), queryFn: () => getMyClient(supabase, id), queryKey: ["my-client", id] });

  useEffect(() => setNote(client.data?.note ?? ""), [client.data?.note]);

  const save = useMutation({
    mutationFn: () => setMyClientNote(supabase, id, note),
    onError: (caught) => setFeedback({ message: errorMessage(caught, t, t("barber.clients.noteError")), variant: "error" }),
    onSuccess: () => {
      setFeedback({ message: t("barber.clients.noteSaved"), variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["my-client", id] });
    },
  });

  const date = (iso: string) => formatDateLabel(formatInstantInShopTime(new Date(iso)).localDate, language);
  const data = client.data;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={data?.customer.fullName ?? t("barber.clients.title")} />
            {client.isLoading ? <SkeletonBlock height={120} width={320} /> : null}
            {client.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(client.error, t, t("barber.clients.detailError"))}</Text> : null}
            {data ? (
              <>
                <View className="items-center gap-3">
                  <Avatar name={data.customer.fullName} size={72} />
                  {data.customer.hasAccount ? null : <Text className="text-xs font-sans text-neutral-500">{t("barber.clients.noAccount")}</Text>}
                </View>

                <View className="flex-row gap-3">
                  <ContactLink icon={MessageCircle} testID="client-whatsapp" url={whatsappUrl(data.customer.phone)}>{t("barber.clients.whatsapp")}</ContactLink>
                  <ContactLink icon={Phone} testID="client-call" url={telUrl(data.customer.phone)}>{t("barber.clients.call")}</ContactLink>
                </View>
                {data.customer.phone ? null : <Text className="text-xs font-sans text-neutral-500">{t("barber.clients.noPhone")}</Text>}

                <View className="flex-row flex-wrap gap-3">
                  <StatTile label={t("barber.clients.statVisits")} testID="client-stat-visits" value={String(data.stats.visits)} />
                  <StatTile label={t("barber.clients.statCancelled")} testID="client-stat-cancelled" value={String(data.stats.cancelled)} />
                  <StatTile label={t("barber.clients.statNoShow")} testID="client-stat-noshow" value={String(data.stats.noShow)} />
                </View>

                <Card variant="outlined">
                  <View className="gap-2">
                    <Line label={t("barber.clients.statLast")}>{data.stats.lastVisitAt ? date(data.stats.lastVisitAt) : t("barber.clients.none")}</Line>
                    <Line label={t("barber.clients.statNext")}>{data.stats.nextVisitAt ? date(data.stats.nextVisitAt) : t("barber.clients.none")}</Line>
                    <Line label={t("barber.clients.statFavorite")}>{data.stats.favoriteService ?? t("barber.clients.none")}</Line>
                  </View>
                </Card>

                <Card variant="outlined" testID="client-history">
                  <View className="gap-3">
                    <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("barber.clients.history")}</Text>
                    {data.history.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("barber.clients.historyEmpty")}</Text> : null}
                    {data.history.map((item) => (
                      <View className="flex-row items-center justify-between gap-2" key={item.id}>
                        <View className="flex-1">
                          <Text className="text-sm font-sans-medium text-ink">{item.serviceName}</Text>
                          <Text className="text-xs font-sans text-neutral-500">{date(item.startsAt)}</Text>
                        </View>
                        <StatusBadge status={item.status} />
                      </View>
                    ))}
                  </View>
                </Card>

                <View className="gap-2">
                  <Text accessibilityRole="header" className="text-lg font-display-semibold text-ink">{t("barber.clients.noteTitle")}</Text>
                  <Input label={t("barber.clients.noteTitle")} multiline onChangeText={setNote} placeholder={t("barber.clients.notePlaceholder")} testID="client-note" value={note} />
                  <Text className="text-xs font-sans text-neutral-500">{t("barber.clients.noteHint")}</Text>
                  <Button disabled={save.isPending} label={t("barber.clients.noteSave")} onPress={() => save.mutate()} testID="client-note-save" />
                </View>
              </>
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
