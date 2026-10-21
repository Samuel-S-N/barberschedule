import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";

import { Avatar } from "../../src/components/domain/Avatar";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { FabAdd } from "../../src/components/ui/FabAdd";
import { Screen } from "../../src/components/ui/Screen";
import { SearchInput } from "../../src/components/ui/SearchInput";
import { listOwnerCustomers, setCustomerActive } from "../../src/features/customers/api";
import type { Customer } from "../../src/features/customers/types";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { pullToRefresh, useRefreshAll } from "../../src/lib/use-refresh";

export default function OwnerCustomersScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const router = useRouter();
  const back = useBack();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const customers = useQuery({
    enabled: shopId !== null,
    queryFn: () => listOwnerCustomers(supabase, shopId ?? ""),
    queryKey: ["owner-customers", shopId],
  });

  const toggle = useMutation({
    mutationFn: (customer: Customer) => setCustomerActive(supabase, customer.id, !customer.active),
    onError: (caught) => setError(errorMessage(caught, t, t("owner.customers.updateError"))),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["owner-customers"] }),
  });

  const loading = shop.isLoading || customers.isLoading;
  const loadError = shop.error ?? customers.error;
  const term = search.trim().toLowerCase();
  const shown = (customers.data ?? []).filter(
    (customer: Customer) => !term || customer.fullName.toLowerCase().includes(term) || (customer.email ?? "").toLowerCase().includes(term) || (customer.phone ?? "").includes(term),
  );

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <ScrollView refreshControl={pullToRefresh(pull)} className="flex-1" contentContainerStyle={{ paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.customers.title")} />
            <SearchInput label={t("owner.appointmentForm.searchCustomer")} onChangeText={setSearch} placeholder={t("examples.search")} testID="customer-search" value={search} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.customers.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {shown.map((customer: Customer) => (
              <Card key={customer.id} testID={`owner-customer-${customer.id}`} variant="outlined">
                <View className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <Avatar name={customer.fullName} size={44} />
                    <View className="flex-1 gap-0.5">
                      <Text className="text-base font-sans-semibold text-ink">{customer.fullName}{customer.active ? "" : ` ${t("common.archived")}`}</Text>
                      <Text className="text-sm font-sans text-neutral-600">{customer.email ?? t("owner.customers.noEmail")} · {customer.phone ?? t("owner.customers.noPhone")}</Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Button label={t("common.edit")} onPress={() => router.push({ params: { id: customer.id }, pathname: "/customer-form" })} size="sm" testID={`customer-edit-${customer.id}`} variant="outline" />
                    <Button disabled={toggle.isPending} label={customer.active ? t("common.deactivate") : t("common.activate")} onPress={() => toggle.mutate(customer)} size="sm" testID={`customer-toggle-${customer.id}`} variant={customer.active ? "danger" : "outline"} />
                  </View>
                </View>
              </Card>
            ))}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </ScrollView>
      <FabAdd label={t("owner.customers.add")} onPress={() => router.push("/customer-form")} />
    </Screen>
  );
}
