import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { errorMessage } from "../../src/i18n/errors";
import type { OwnerBarber } from "../../src/features/barbers/types";
import {
  createBarber,
  listOwnerBarbers,
  setBarberActive,
  updateBarber,
} from "../../src/features/barbers/api";
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

export default function OwnerBarbersScreen() {
  const { t } = useTranslation();
  const { supabase } = useSupabaseSession();
  const [barbers, setBarbers] = useState<OwnerBarber[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [shopId, setShopId] = useState<string | null>(null);

  const refresh = async () => {
    if (!shopId) {
      return;
    }

    const nextBarbers = await listOwnerBarbers(supabase, shopId);
    setBarbers(nextBarbers);
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

        setBarbers(await listOwnerBarbers(supabase, nextShopId));
      } catch (error) {
        if (active) {
          setFeedback(errorMessage(error, t as never, t("owner.barbers.loadError")));
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
    setName("");
  };

  const handleSave = async () => {
    if (!shopId) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      if (editingId) {
        await updateBarber(supabase, editingId, { name });
      } else {
        await createBarber(supabase, { name, shopId });
      }

      resetForm();
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.barbers.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggle = async (barber: OwnerBarber) => {
    setFeedback(null);
    setIsSaving(true);

    try {
      await setBarberActive(supabase, barber.id, !barber.active);
      await refresh();
    } catch (error) {
      setFeedback(errorMessage(error, t as never, t("owner.barbers.updateError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t("owner.barbers.title")}
        </Text>
        <TextInput
          onChangeText={setName}
          placeholder={t("owner.barbers.nameLabel")}
          style={styles.input}
          value={name}
        />
        {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
        {isLoading || isSaving ? <ActivityIndicator /> : null}
        <Button
          disabled={name.trim().length === 0 || isLoading || isSaving || !shopId}
          onPress={handleSave}
          title={editingId ? t("owner.barbers.save") : t("owner.barbers.add")}
        />
        {editingId ? <Button onPress={resetForm} title={t("common.cancelEdit")} /> : null}
        <View style={styles.list}>
          {barbers.map((barber) => (
            <View key={barber.id} style={styles.card}>
              <Text style={styles.name}>
                {barber.name} {barber.active ? "" : t("common.archived")}
              </Text>
              <Button
                onPress={() => {
                  setEditingId(barber.id);
                  setName(barber.name);
                }}
                title={t("common.edit")}
              />
              <Button
                onPress={() => {
                  void handleToggle(barber);
                }}
                title={barber.active ? t("common.deactivate") : t("common.activate")}
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
