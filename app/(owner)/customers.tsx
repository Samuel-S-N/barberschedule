import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import type { Customer } from "../../src/features/customers/types";
import {
  createCustomer,
  listOwnerCustomers,
  setCustomerActive,
  updateCustomer,
} from "../../src/features/customers/api";
import { canSubmitCustomerForm } from "../../src/features/customers/validation";
import { useSupabaseSession } from "../../src/providers/AppProviders";

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
          setFeedback("No shop found.");
          return;
        }

        setCustomers(await listOwnerCustomers(supabase, nextShopId));
      } catch (error) {
        if (active) {
          setFeedback(error instanceof Error ? error.message : "Unable to load customers.");
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
      setFeedback(error instanceof Error ? error.message : "Unable to save customer.");
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
      setFeedback(error instanceof Error ? error.message : "Unable to update customer.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Owner customers
        </Text>
        <TextInput
          onChangeText={setFullName}
          placeholder="Customer name"
          style={styles.input}
          value={fullName}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email (optional)"
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPhone}
          placeholder="Phone (optional)"
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
          title={editingId ? "Save customer" : "Add customer"}
        />
        {editingId ? <Button onPress={resetForm} title="Cancel edit" /> : null}
        <View style={styles.list}>
          {customers.map((customer) => (
            <View key={customer.id} style={styles.card}>
              <Text style={styles.name}>
                {customer.fullName} {customer.active ? "" : "(archived)"}
              </Text>
              <Text style={styles.meta}>
                {customer.email ?? "no email"} · {customer.phone ?? "no phone"}
              </Text>
              <Button
                onPress={() => {
                  setEditingId(customer.id);
                  setEmail(customer.email ?? "");
                  setFullName(customer.fullName);
                  setPhone(customer.phone ?? "");
                }}
                title="Edit"
              />
              <Button
                onPress={() => {
                  void handleToggle(customer);
                }}
                title={customer.active ? "Deactivate" : "Activate"}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
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
