import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Button, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { errorMessage } from "../../src/i18n/errors";
import type { BarberCompensation, OwnerBarber } from "../../src/features/barbers/types";
import {
  createBarber,
  getBarberAccountStatus,
  inviteBarber,
  listOwnerBarbers,
  setBarberActive,
  setBarberCompensation,
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
  const [signedIn, setSignedIn] = useState<Record<string, boolean>>({});
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [compensationId, setCompensationId] = useState<string | null>(null);
  const [compType, setCompType] = useState<BarberCompensation["type"]>("commission");
  const [percent, setPercent] = useState("");
  const [rentCents, setRentCents] = useState("");
  const [rentFrequency, setRentFrequency] = useState<"weekly" | "monthly">("monthly");

  const loadSignedIn = async (list: OwnerBarber[]) => {
    const linked = list.filter((barber) => barber.userId);
    const entries = await Promise.all(
      linked.map(async (barber) => [barber.id, await getBarberAccountStatus(supabase, barber.id).catch(() => false)] as const),
    );
    setSignedIn(Object.fromEntries(entries));
  };

  const refresh = async () => {
    if (!shopId) {
      return;
    }

    const nextBarbers = await listOwnerBarbers(supabase, shopId);
    setBarbers(nextBarbers);
    await loadSignedIn(nextBarbers);
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

        const initial = await listOwnerBarbers(supabase, nextShopId);
        setBarbers(initial);
        await loadSignedIn(initial);
      } catch (error) {
        if (active) {
          setFeedback(errorMessage(error, t, t("owner.barbers.loadError")));
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
      setFeedback(errorMessage(error, t, t("owner.barbers.saveError")));
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
      setFeedback(errorMessage(error, t, t("owner.barbers.updateError")));
    } finally {
      setIsSaving(false);
    }
  };

  const startCompensation = (barber: OwnerBarber) => {
    setCompensationId(barber.id);
    setCompType(barber.compensation.type);
    setPercent(barber.compensation.type === "commission" ? String(barber.compensation.commissionPercent) : "");
    setRentCents(barber.compensation.type === "chair_rental" ? String(barber.compensation.amountCents) : "");
    setRentFrequency(barber.compensation.type === "chair_rental" ? barber.compensation.frequency : "monthly");
  };

  const handleSaveCompensation = async () => {
    if (!compensationId) return;
    setFeedback(null);
    setIsSaving(true);

    try {
      await setBarberCompensation(
        supabase,
        compensationId,
        compType === "commission"
          ? { commissionPercent: Number(percent), type: "commission" }
          : { amountCents: Number(rentCents), frequency: rentFrequency, type: "chair_rental" },
      );
      setCompensationId(null);
      await refresh();
      setFeedback(t("owner.barbers.compensationSaved"));
    } catch (error) {
      setFeedback(errorMessage(error, t, t("owner.barbers.compensationError")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!invitingId) return;
    setFeedback(null);
    setIsSaving(true);

    try {
      await inviteBarber(supabase, { barberId: invitingId, email: inviteEmail.trim() });
      setInvitingId(null);
      setInviteEmail("");
      await refresh();
      setFeedback(t("owner.barbers.inviteSent"));
    } catch (error) {
      setFeedback(errorMessage(error, t, t("owner.barbers.inviteError")));
    } finally {
      setIsSaving(false);
    }
  };

  const accountStatus = (barber: OwnerBarber) =>
    !barber.userId ? "owner.barbers.statusNone" : signedIn[barber.id] ? "owner.barbers.statusActive" : "owner.barbers.statusInvited";

  const compensationSummary = (barber: OwnerBarber) =>
    barber.compensation.type === "commission"
      ? t("owner.barbers.summaryCommission", { percent: barber.compensation.commissionPercent })
      : t("owner.barbers.summaryChairRental", {
          amount: barber.compensation.amountCents,
          frequency: t(`barber.frequency.${barber.compensation.frequency}`),
        });

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
              <Text>{t(accountStatus(barber))}</Text>
              <Text>{compensationSummary(barber)}</Text>
              {!barber.userId ? (
                <Button
                  onPress={() => {
                    setInvitingId(barber.id);
                    setInviteEmail("");
                  }}
                  title={t("owner.barbers.invite")}
                />
              ) : null}
              {invitingId === barber.id ? (
                <View style={styles.list}>
                  <TextInput
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={setInviteEmail}
                    placeholder={t("owner.barbers.inviteEmailLabel")}
                    style={styles.input}
                    value={inviteEmail}
                  />
                  <Button
                    disabled={isSaving || !inviteEmail.includes("@")}
                    onPress={() => void handleInvite()}
                    title={t("owner.barbers.sendInvite")}
                  />
                  <Button onPress={() => setInvitingId(null)} title={t("common.cancel")} />
                </View>
              ) : null}
              <Button onPress={() => startCompensation(barber)} title={t("owner.barbers.compensation")} />
              {compensationId === barber.id ? (
                <View style={styles.list}>
                  <View style={styles.row}>
                    <Button
                      color={compType === "commission" ? "#2563eb" : undefined}
                      onPress={() => setCompType("commission")}
                      title={t("owner.barbers.commissionTab")}
                    />
                    <Button
                      color={compType === "chair_rental" ? "#2563eb" : undefined}
                      onPress={() => setCompType("chair_rental")}
                      title={t("owner.barbers.chairRentalTab")}
                    />
                  </View>
                  {compType === "commission" ? (
                    <TextInput
                      keyboardType="numeric"
                      onChangeText={setPercent}
                      placeholder={t("owner.barbers.commissionPercentLabel")}
                      style={styles.input}
                      value={percent}
                    />
                  ) : (
                    <>
                      <TextInput
                        keyboardType="numeric"
                        onChangeText={setRentCents}
                        placeholder={t("owner.barbers.rentalAmountLabel")}
                        style={styles.input}
                        value={rentCents}
                      />
                      <View style={styles.row}>
                        {(["weekly", "monthly"] as const).map((frequency) => (
                          <Button
                            color={rentFrequency === frequency ? "#2563eb" : undefined}
                            key={frequency}
                            onPress={() => setRentFrequency(frequency)}
                            title={t(`barber.frequency.${frequency}`)}
                          />
                        ))}
                      </View>
                    </>
                  )}
                  <Button disabled={isSaving} onPress={() => void handleSaveCompensation()} title={t("owner.barbers.saveCompensation")} />
                  <Button onPress={() => setCompensationId(null)} title={t("common.cancel")} />
                </View>
              ) : null}
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
  row: {
    flexDirection: "row",
    gap: 8,
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
