import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { errorMessage } from "../../src/i18n/errors";
import type { Customer } from "../../src/features/customers/types";
import {
  createCustomer,
  listOwnerCustomers,
  setCustomerActive,
  updateCustomer,
} from "../../src/features/customers/api";
import { canSubmitCustomerForm } from "../../src/features/customers/validation";
import { useSupabaseSession } from "../../src/providers/AppProviders";
import { Screen } from "../../src/components/ui/Screen";

type ShopRow = { id: string };

async function loadShopId(supabase: ReturnType<typeof useSupabaseSession>["supabase"]) {
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as ShopRow[] | null)?.[0]?.id ?? null;
}

export default function OwnerCustomersScreen() {
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [shopId, setShopId] = useState<string | null>(null);

  const refresh = async () => {
    if (!shopId) {
      return;
    }

    setCustomers(await listOwnerCustomers(supabase, shopId));
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextShopId = await loadShopId(supabase);

        if (!active) {
          return;
        }

        setShopId(nextShopId);

        if (!nextShopId) {
          setFeedback(t("common.noShop"));
          return;
        }

        setCustomers(await listOwnerCustomers(supabase, nextShopId));
      } catch (error) {
        if (active) {
          setFeedback(errorMessage(error, t as never, t("owner.customers.loadError")));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [supabase]);

  const resetForm = () => {
    setEditingId(null);
    setEmail("");
    setFullName("");
    setPhone("");
  };

  const handleSave = async () => {
    if (!shopId) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const payload = {
        email: email.trim() || null,
        fullName,
        phone: phone.trim() || null,
      };

      if (editingId) {
        await updateCustomer(supabase, editingId, payload);
      } else {
        await createCustomer(supabase, { ...payload, shopId });
      }

      resetForm();
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.customers.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (customer: Customer) => {
    setFeedback(null);
    setIsSaving(true);

    try {
      await setCustomerActive(supabase, customer.id, !customer.active);
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.customers.updateError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("owner.customers.title")}
        </Text>
        <TextInput
          onChangeText={setFullName}
          placeholder={t("owner.customers.nameLabel")}
          style={styles.input}
          value={fullName}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder={t("owner.customers.emailLabel")}
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPhone}
          placeholder={t("common.phoneOptional")}
          style={styles.input}
          value={phone}
        />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        <Button
          disabled={!canSubmitCustomerForm({
            editingId,
            email,
            fullName,
            isLoading,
            isSaving,
            phone,
            shopId,
          })}
          onPress={handleSave}
          title={editingId ? t("owner.customers.save") : t("owner.customers.add")}
        />
        {editingId ? <Button onPress={resetForm} title={t("common.cancelEdit")} /> : null}
        <View style={styles.list}>
          {customers.map((customer) => (
            <View key={customer.id} style={styles.card}>
              <Text style={styles.name}>
                {customer.fullName} {customer.active ? "" : t("common.archived")}
              </Text>
              <Text style={styles.meta}>
                {customer.email ?? t("owner.customers.noEmail")} · {customer.phone ?? t("owner.customers.noPhone")}
              </Text>
              <Button
                onPress={() => {
                  setEditingId(customer.id);
                  setEmail(customer.email ?? "");
                  setFullName(customer.fullName);
                  setPhone(customer.phone ?? "");
                }}
                title={t("common.edit")}
              />
              <Button
                onPress={() => {
                  void handleToggle(customer);
                }}
                title={customer.active ? t("common.deactivate") : t("common.activate")}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: "#d1d5db",
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  content: {
    gap: 12,
    padding: 24,
  },
  feedback: {
    color: "#1f2937",
  },
  input: {
    borderColor: "#d1d5db",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  list: {
    gap: 12,
  },
  meta: {
    color: "#4b5563",
  },
  name: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  screen: {
    backgroundColor: "#ffffff",
    flex: 1,
  },
  title: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "700",
  },
});
