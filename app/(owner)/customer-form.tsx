import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { formatPhone } from "../../src/features/account/phone";
import { createCustomer, listOwnerCustomers, updateCustomer } from "../../src/features/customers/api";
import { canSubmitCustomerForm } from "../../src/features/customers/validation";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// Create (no `id`) or edit (`?id=`) a customer.
export default function OwnerCustomerFormScreen() {
  const { t } = useTranslation();
  const back = useBack("/customers");
  const field = useFieldChain(3);
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const customers = useQuery({
    enabled: shopId !== null,
    queryFn: () => listOwnerCustomers(supabase, shopId ?? ""),
    queryKey: ["owner-customers", shopId],
  });
  const customer = id ? customers.data?.find((candidate) => candidate.id === id) ?? null : null;
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customer) return;
    setFullName(customer.fullName);
    setEmail(customer.email ?? "");
    setPhone(formatPhone(customer.phone ?? ""));
  }, [customer]);

  const save = useMutation({
    mutationFn: () => {
      const payload = { email: email.trim() || null, fullName, phone: phone.trim() || null };

      return id ? updateCustomer(supabase, id, payload) : createCustomer(supabase, { ...payload, shopId: shopId ?? "" });
    },
    onError: (caught) => setError(errorMessage(caught, t, t("owner.customers.saveError"))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-customers"] });
      back();
    },
  });

  const loading = shop.isLoading || customers.isLoading;

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={id ? t("owner.customers.editTitle") : t("owner.customers.newTitle")} />
            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {customers.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(customers.error, t, t("owner.customers.loadError"))}</Text> : null}
            {id && customers.data && !customer ? <EmptyState title={t("owner.customers.notFound")} /> : null}
            {!id || customer ? (
              <Card>
                <View className="gap-3">
                  <Input {...field(0)} label={t("owner.customers.nameLabel")} onChangeText={setFullName} testID="customer-name" value={fullName} />
                  <Input {...field(1)} autoCapitalize="none" autoComplete="email" keyboardType="email-address" label={t("owner.customers.emailLabel")} onChangeText={setEmail} testID="customer-email" value={email} />
                  <Input {...field(2)} keyboardType="phone-pad" label={t("common.phoneOptional")} onChangeText={(value) => setPhone(formatPhone(value))} testID="customer-phone" value={phone} />
                  <Button
                    disabled={!canSubmitCustomerForm({ editingId: id ?? null, email, fullName, isLoading: loading, isSaving: save.isPending, phone, shopId })}
                    label={id ? t("owner.customers.save") : t("owner.customers.add")}
                    onPress={() => save.mutate()}
                    testID="customer-save"
                  />
                </View>
              </Card>
            ) : null}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
