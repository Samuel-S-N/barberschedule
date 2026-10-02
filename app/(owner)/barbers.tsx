import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { Avatar } from "../../src/components/domain/Avatar";
import { EmptyState } from "../../src/components/domain/EmptyState";
import { formatPriceBRL } from "../../src/components/domain/ServiceCard";
import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../src/components/domain/SkeletonLoader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Card } from "../../src/components/ui/Card";
import { Input } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import {
  createBarber,
  getBarberAccountStatus,
  inviteBarber,
  listOwnerBarbers,
  setBarberActive,
  setBarberCompensation,
  updateBarber,
} from "../../src/features/barbers/api";
import type { BarberCompensation, OwnerBarber } from "../../src/features/barbers/types";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerBarbersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [compensationId, setCompensationId] = useState<string | null>(null);
  const [compType, setCompType] = useState<BarberCompensation["type"]>("commission");
  const [percent, setPercent] = useState("");
  const [rent, setRent] = useState("");
  const [rentFrequency, setRentFrequency] = useState<"weekly" | "monthly">("monthly");

  const barbers = useQuery({
    enabled: shopId !== null,
    queryFn: async () => {
      const list = await listOwnerBarbers(supabase, shopId ?? "");
      const linked = list.filter((barber: OwnerBarber) => barber.userId);
      const entries = await Promise.all(linked.map(async (barber: OwnerBarber) => [barber.id, await getBarberAccountStatus(supabase, barber.id).catch(() => false)] as const));

      return { list, signedIn: Object.fromEntries(entries) as Record<string, boolean> };
    },
    queryKey: ["owner-barbers", shopId],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["owner-barbers"] });
  const fail = (error: unknown, fallback: string) => setFeedback({ message: errorMessage(error, t, fallback), variant: "error" });
  const ok = (message: string) => setFeedback({ message, variant: "success" });

  const resetForm = () => {
    setEditingId(null);
    setName("");
  };

  const save = useMutation({
    mutationFn: () => (editingId ? updateBarber(supabase, editingId, { name }) : createBarber(supabase, { name, shopId: shopId ?? "" })),
    onError: (error) => fail(error, t("owner.barbers.saveError")),
    onSuccess: () => {
      resetForm();
      void refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: (barber: OwnerBarber) => setBarberActive(supabase, barber.id, !barber.active),
    onError: (error) => fail(error, t("owner.barbers.updateError")),
    onSuccess: () => void refresh(),
  });

  const invite = useMutation({
    mutationFn: () => inviteBarber(supabase, { barberId: invitingId ?? "", email: inviteEmail.trim() }),
    onError: (error) => fail(error, t("owner.barbers.inviteError")),
    onSuccess: () => {
      setInvitingId(null);
      setInviteEmail("");
      ok(t("owner.barbers.inviteSent"));
      void refresh();
    },
  });

  const saveCompensation = useMutation({
    mutationFn: () => {
      if (compType === "commission") return setBarberCompensation(supabase, compensationId ?? "", { commissionPercent: Number(percent), type: "commission" });
      const amountCents = parseReaisToCents(rent);
      if (amountCents === null) throw Object.assign(new Error("invalid"), { code: "P0021" });

      return setBarberCompensation(supabase, compensationId ?? "", { amountCents, frequency: rentFrequency, type: "chair_rental" });
    },
    onError: (error) => fail(error, t("owner.barbers.compensationError")),
    onSuccess: () => {
      setCompensationId(null);
      ok(t("owner.barbers.compensationSaved"));
      void refresh();
    },
  });

  const startCompensation = (barber: OwnerBarber) => {
    setCompensationId(barber.id);
    setCompType(barber.compensation.type);
    setPercent(barber.compensation.type === "commission" ? String(barber.compensation.commissionPercent) : "");
    setRent(barber.compensation.type === "chair_rental" ? centsToReaisInput(barber.compensation.amountCents) : "");
    setRentFrequency(barber.compensation.type === "chair_rental" ? barber.compensation.frequency : "monthly");
  };

  const accountStatus = (barber: OwnerBarber, signedIn: Record<string, boolean>) =>
    !barber.userId ? "owner.barbers.statusNone" : signedIn[barber.id] ? "owner.barbers.statusActive" : "owner.barbers.statusInvited";

  const compensationSummary = (barber: OwnerBarber) =>
    barber.compensation.type === "commission"
      ? t("owner.barbers.summaryCommission", { percent: barber.compensation.commissionPercent })
      : t("owner.barbers.summaryChairRental", { amount: formatPriceBRL(barber.compensation.amountCents), frequency: t(`barber.frequency.${barber.compensation.frequency}`) });

  const busy = save.isPending || toggle.isPending || invite.isPending || saveCompensation.isPending;
  const loading = shop.isLoading || barbers.isLoading;
  const loadError = shop.error ?? barbers.error;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/manage"));

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.barbers.title")} />

            <Card>
              <View className="gap-3">
                <Input label={t("owner.barbers.nameLabel")} onChangeText={setName} testID="barber-name-input" value={name} />
                <View className="flex-row gap-2">
                  <Button disabled={name.trim().length === 0 || loading || busy || !shopId} label={editingId ? t("owner.barbers.save") : t("owner.barbers.add")} onPress={() => save.mutate()} testID="barber-save" />
                  {editingId ? <Button label={t("common.cancelEdit")} onPress={resetForm} variant="outline" /> : null}
                </View>
              </View>
            </Card>

            {loading ? <SkeletonBlock height={96} width={320} /> : null}
            {loadError ? <Text className="text-sm font-sans text-danger-500">{errorMessage(loadError, t, t("owner.barbers.loadError"))}</Text> : null}
            {shop.data === null ? <EmptyState title={t("common.noShop")} /> : null}

            {(barbers.data?.list ?? []).map((barber: OwnerBarber) => (
              <Card key={barber.id} testID={`owner-barber-${barber.id}`} variant="outlined">
                <View className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <Avatar name={barber.name} size={44} uri={barber.avatarUrl} />
                    <View className="flex-1 gap-0.5">
                      <Text className="text-base font-sans-semibold text-ink">{barber.name}{barber.active ? "" : ` ${t("common.archived")}`}</Text>
                      <Text className="text-sm font-sans text-neutral-600">{t(accountStatus(barber, barbers.data?.signedIn ?? {}))}</Text>
                      <Text className="text-sm font-sans text-neutral-600">{compensationSummary(barber)}</Text>
                    </View>
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    <Button label={t("common.edit")} onPress={() => { setEditingId(barber.id); setName(barber.name); }} size="sm" testID={`barber-edit-${barber.id}`} variant="outline" />
                    <Button disabled={busy} label={barber.active ? t("common.deactivate") : t("common.activate")} onPress={() => toggle.mutate(barber)} size="sm" testID={`barber-toggle-${barber.id}`} variant="outline" />
                    {!barber.userId ? <Button label={t("owner.barbers.invite")} onPress={() => { setInvitingId(barber.id); setInviteEmail(""); }} size="sm" testID={`barber-invite-${barber.id}`} variant="outline" /> : null}
                    <Button label={t("owner.barbers.compensation")} onPress={() => startCompensation(barber)} size="sm" testID={`barber-comp-${barber.id}`} variant="outline" />
                  </View>

                  {invitingId === barber.id ? (
                    <View className="gap-2">
                      <Input autoCapitalize="none" keyboardType="email-address" label={t("owner.barbers.inviteEmailLabel")} onChangeText={setInviteEmail} testID="barber-invite-email" value={inviteEmail} />
                      <View className="flex-row gap-2">
                        <Button disabled={busy || !inviteEmail.includes("@")} label={t("owner.barbers.sendInvite")} onPress={() => invite.mutate()} size="sm" testID="barber-invite-send" />
                        <Button label={t("common.cancel")} onPress={() => setInvitingId(null)} size="sm" variant="outline" />
                      </View>
                    </View>
                  ) : null}

                  {compensationId === barber.id ? (
                    <View className="gap-2">
                      <View className="flex-row gap-2">
                        <Button label={t("owner.barbers.commissionTab")} onPress={() => setCompType("commission")} size="sm" testID="comp-type-commission" variant={compType === "commission" ? "dark" : "outline"} />
                        <Button label={t("owner.barbers.chairRentalTab")} onPress={() => setCompType("chair_rental")} size="sm" testID="comp-type-chair_rental" variant={compType === "chair_rental" ? "dark" : "outline"} />
                      </View>
                      {compType === "commission" ? (
                        <Input keyboardType="numeric" label={t("owner.barbers.commissionPercentLabel")} onChangeText={setPercent} testID="comp-percent" value={percent} />
                      ) : (
                        <>
                          <Input keyboardType="numeric" label={t("owner.barbers.rentalAmountLabel")} onChangeText={setRent} testID="comp-rent" value={rent} />
                          <View className="flex-row gap-2">
                            {(["weekly", "monthly"] as const).map((frequency) => (
                              <Button key={frequency} label={t(`barber.frequency.${frequency}`)} onPress={() => setRentFrequency(frequency)} size="sm" testID={`comp-freq-${frequency}`} variant={rentFrequency === frequency ? "dark" : "outline"} />
                            ))}
                          </View>
                        </>
                      )}
                      <View className="flex-row gap-2">
                        <Button disabled={busy} label={t("owner.barbers.saveCompensation")} onPress={() => saveCompensation.mutate()} size="sm" testID="comp-save" />
                        <Button label={t("common.cancel")} onPress={() => setCompensationId(null)} size="sm" variant="outline" />
                      </View>
                    </View>
                  ) : null}
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
