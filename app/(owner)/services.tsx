import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { errorMessage } from "../../src/i18n/errors";
import type { Service } from "../../src/features/services/types";
import {
  createService,
  listOwnerServices,
  setServiceActive,
  updateService,
} from "../../src/features/services/api";
import {
  isIntegerInput,
  parseIntegerInput,
} from "../../src/features/services/validation";
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

export default function OwnerServicesScreen() {
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [priceCents, setPriceCents] = useState("2500");
  const [services, setServices] = useState<Service[]>([]);
  const [shopId, setShopId] = useState<string | null>(null);

  const refresh = async () => {
    if (!shopId) {
      return;
    }

    setServices(await listOwnerServices(supabase, shopId));
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

        setServices(await listOwnerServices(supabase, nextShopId));
      } catch (error) {
        if (active) {
          setFeedback(errorMessage(error, t as never, t("owner.services.loadError")));
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
    setDescription("");
    setDurationMinutes("30");
    setEditingId(null);
    setName("");
    setPriceCents("2500");
  };

  const handleSave = async () => {
    if (!shopId) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const payload = {
        description: description.trim() || null,
        durationMinutes: parseIntegerInput(durationMinutes, "Duration"),
        name,
        priceCents: parseIntegerInput(priceCents, "Price"),
      };

      if (editingId) {
        await updateService(supabase, editingId, payload);
      } else {
        await createService(supabase, { ...payload, shopId });
      }

      resetForm();
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.services.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (service: Service) => {
    setFeedback(null);
    setIsSaving(true);

    try {
      await setServiceActive(supabase, service.id, !service.active);
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.services.updateError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("owner.services.title")}
        </Text>
        <TextInput
          onChangeText={setName}
          placeholder={t("owner.services.nameLabel")}
          style={styles.input}
          value={name}
        />
        <TextInput
          keyboardType="numeric"
          onChangeText={setDurationMinutes}
          placeholder={t("owner.services.durationLabel")}
          style={styles.input}
          value={durationMinutes}
        />
        <TextInput
          keyboardType="numeric"
          onChangeText={setPriceCents}
          placeholder={t("owner.services.priceLabel")}
          style={styles.input}
          value={priceCents}
        />
        <TextInput
          onChangeText={setDescription}
          placeholder={t("owner.services.descriptionLabel")}
          style={styles.input}
          value={description}
        />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        <Button
          disabled={
            name.trim().length === 0
            || isLoading
            || isSaving
            || !shopId
            || !isIntegerInput(durationMinutes)
            || !isIntegerInput(priceCents)
          }
          onPress={handleSave}
          title={editingId ? t("owner.services.save") : t("owner.services.add")}
        />
        {editingId ? <Button onPress={resetForm} title={t("common.cancelEdit")} /> : null}
        <View style={styles.list}>
          {services.map((service) => (
            <View key={service.id} style={styles.card}>
              <Text style={styles.name}>
                {t("owner.services.summary", { minutes: service.durationMinutes, name: service.name, price: service.priceCents })}{" "}
                {service.active ? "" : t("common.archived")}
              </Text>
              {service.description ? (
                <Text style={styles.description}>{service.description}</Text>
              ) : null}
              <Button
                onPress={() => {
                  setDescription(service.description ?? "");
                  setDurationMinutes(String(service.durationMinutes));
                  setEditingId(service.id);
                  setName(service.name);
                  setPriceCents(String(service.priceCents));
                }}
                title={t("common.edit")}
              />
              <Button
                onPress={() => {
                  void handleToggle(service);
                }}
                title={service.active ? t("common.deactivate") : t("common.activate")}
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
  description: {
    color: "#4b5563",
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
