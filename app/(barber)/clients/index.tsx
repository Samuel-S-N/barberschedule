import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "../../../src/components/domain/Avatar";
import { EmptyState } from "../../../src/components/domain/EmptyState";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Button } from "../../../src/components/ui/Button";
import { Card } from "../../../src/components/ui/Card";
import { Input } from "../../../src/components/ui/Input";
import { Screen } from "../../../src/components/ui/Screen";
import { listMyClients, type MyClient } from "../../../src/features/clients/api";
import { errorMessage } from "../../../src/i18n/errors";
import { useLanguage } from "../../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { formatDateLabel } from "../../../src/lib/i18n/format";
import { useSupabaseSession } from "../../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";

const CLIENTS_PAGE_SIZE = 50;

export default function ClientsScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [onlyLapsed, setOnlyLapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);

    return () => clearTimeout(timer);
  }, [search]);

  const clients = useInfiniteQuery({
    getNextPageParam: (last: MyClient[], all: MyClient[][]) => (last.length === CLIENTS_PAGE_SIZE ? all.length * CLIENTS_PAGE_SIZE : undefined),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listMyClients(supabase, { limit: CLIENTS_PAGE_SIZE, offset: pageParam, onlyLapsed, search: debounced }),
    queryKey: ["my-clients", onlyLapsed, debounced],
  });
  const rows = clients.data?.pages.flat() ?? [];

  const emptyTitle = debounced ? t("barber.clients.emptySearch") : onlyLapsed ? t("barber.clients.emptyLapsed") : t("barber.clients.empty");

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center gap-4 p-5">
          <Text accessibilityRole="header" className="w-full max-w-[420px] text-3xl font-display-bold text-ink">{t("barber.clients.title")}</Text>
          <View className="w-full max-w-[420px] gap-3">
            <Input label={t("barber.clients.searchLabel")} onChangeText={setSearch} testID="client-search" value={search} />
            <View className="flex-row gap-2">
              <Button label={t("barber.clients.filterAll")} onPress={() => setOnlyLapsed(false)} size="sm" testID="clients-filter-all" variant={onlyLapsed ? "outline" : "dark"} />
              <Button label={t("barber.clients.filterLapsed")} onPress={() => setOnlyLapsed(true)} size="sm" testID="clients-filter-lapsed" variant={onlyLapsed ? "dark" : "outline"} />
            </View>
            {clients.isLoading ? <SkeletonBlock height={72} width={320} /> : null}
            {clients.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(clients.error, t, t("barber.clients.loadError"))}</Text> : null}
            {!clients.isLoading && !clients.error && rows.length === 0 ? <EmptyState title={emptyTitle} /> : null}
            {rows.map((client) => (
              <Pressable accessibilityRole="button" key={client.customerId} onPress={() => router.push(`/clients/${client.customerId}`)} testID={`client-row-${client.customerId}`}>
                <Card variant="outlined">
                  <View className="flex-row items-center gap-3">
                    <Avatar name={client.fullName} size={44} />
                    <View className="flex-1 gap-0.5">
                      <Text className="text-base font-sans-semibold text-ink">{client.fullName}</Text>
                      <Text className="text-sm font-sans text-neutral-600">
                        {client.lastVisitAt
                          ? t("barber.clients.lastVisit", { date: formatDateLabel(formatInstantInShopTime(new Date(client.lastVisitAt)).localDate, language) })
                          : t("barber.clients.neverVisited")}
                      </Text>
                      <Text className="text-xs font-sans text-neutral-500">
                        {t("barber.clients.visitsLine", { count: client.visits })}
                        {client.hasAccount ? "" : ` · ${t("barber.clients.noAccount")}`}
                      </Text>
                    </View>
                    {client.isLapsed ? (
                      <View className="rounded-full bg-warning-500/10 px-2 py-1" testID={`client-lapsed-${client.customerId}`}>
                        <Text className="text-xs font-sans-semibold text-neutral-700">{t("barber.clients.lapsedBadge")}</Text>
                      </View>
                    ) : null}
                  </View>
                </Card>
              </Pressable>
            ))}
            {clients.hasNextPage ? (
              <Button disabled={clients.isFetchingNextPage} label={t("barber.clients.loadMore")} onPress={() => void clients.fetchNextPage()} testID="clients-load-more" variant="outline" />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
