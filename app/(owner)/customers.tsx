import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
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
import { createCustomer, listOwnerCustomers, setCustomerActive, updateCustomer } from "../../src/features/customers/api";
import type { Customer } from "../../src/features/customers/types";
import { canSubmitCustomerForm } from "../../src/features/customers/validation";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerCustomersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");

  const customers = useQuery({
    enabled: shopId !== null,
    queryFn: () => listOwnerCustomers(supabase, shopId ?? ""),
    queryKey: ["owner-customers", shopId],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-customers"] });
  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });

  const resetForm = () => {
    setEditingId(null);
    setEmail("");
    setFullName("");
    setPhone("");
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = { email: email.trim() || null, fullName, phone: phone.trim() || null };

      return editingId ? updateCustomer(supabase, editingId, payload) : createCustomer(supabase, { ...payload, shopId: shopId ?? "" });
    },
    onError: (error) => fail(error, t("owner.customers.saveError")),
    onSuccess: () => {
      resetForm();
      void refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (customer: Customer) => setCustomerActive(supabase, customer.id, !customer.active),
    onError: (error) => fail(error, t("owner.customers.updateError")),
    onSuccess: () => void refresh(),
  });

  const loading = shop.isLoading || customers.isLoading;
  const loadError = shop.error ?? customers.error;
  const busy = save.isPending || toggle.isPending;
  const term = search.trim().toLowerCase();
  const shown = (customers.data ?? []).filter(
    (customer: Customer) => !term || customer.fullName.toLowerCase().includes(term) || (customer.email ?? "").toLowerCase().includes(term) || (customer.phone ?? "").includes(term),
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.customers.title")} />

            <Card>
              <View className="gap-3">
                <Input label={t("owner.customers.nameLabel")} onChangeText={setFullName} testID="customer-name" value={fullName} />
                <Input autoCapitalize="none" autoComplete="email" keyboardType="email-address" label={t("owner.customers.emailLabel")} onChangeText={setEmail} testID="customer-email" value={email} />
                <Input keyboardType="phone-pad" label={t("common.phoneOptional")} onChangeText={setPhone} testID="customer-phone" value={phone} />
                <View className="flex-row gap-2">
                  <Button
                    disabled={!canSubmitCustomerForm({ editingId, email, fullName, isLoading: loading, isSaving: busy, phone, shopId })}
                    label={editingId ? t("owner.customers.save") : t("owner.customers.add")}
                    onPress={() => save.mutate()}
                    testID="customer-save"
                  />
                  {editingId ? <Button label={t("common.cancelEdit")} onPress={resetForm} variant="outline" /> : null}
                </View>
              </View>
            </Card>

            <Input label={t("owner.appointmentForm.searchCustomer")} onChangeText={setSearch} testID="customer-search" value={search} />
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
                    <Button
                      label={t("common.edit")}
                      onPress={() => {
                        setEditingId(customer.id);
                        setEmail(customer.email ?? "");
                        setFullName(customer.fullName);
                        setPhone(customer.phone ?? "");
                      }}
                      size="sm"
                      testID={`customer-edit-${customer.id}`}
                      variant="outline"
                    />
                    <Button disabled={busy} label={customer.active ? t("common.deactivate") : t("common.activate")} onPress={() => toggle.mutate(customer)} size="sm" testID={`customer-toggle-${customer.id}`} variant="outline" />
                  </View>
                </View>
              </Card>
            ))}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
