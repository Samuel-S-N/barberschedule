import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { createProfessional, inviteProfessional } from "../../src/features/professionals/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useFromSetup } from "../../src/features/setup/from-setup";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerProfessionalNewScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const { fromSetup, returnToSetup } = useFromSetup();
  const field = useFieldChain(2);
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  // A created professional is kept even when the invite fails: the screen then says so and offers to send the invite again (without
  // creating the professional twice) or to finish and invite later from the professional's profile.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ message: string; variant: "error" | "success" } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leave = () => {
    void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] });
    if (fromSetup) returnToSetup();
    else back();
  };

  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  const create = useMutation({
    mutationFn: async () => {
      let id = createdId;

      if (!id) {
        id = (await createProfessional(supabase, { name, shopId: shopId ?? "" })).id;
        setCreatedId(id);
      }
      const address = email.trim();

      if (!address.includes("@")) return { invited: null, inviteError: null };

      try {
        await inviteProfessional(supabase, { professionalId: id, email: address });

        return { invited: address, inviteError: null };
      } catch (caught) {
        return { invited: null, inviteError: caught };
      }
    },
    onError: (caught) => setError(errorMessage(caught, t, t("owner.professionals.saveError"))),
    onSuccess: ({ invited, inviteError }) => {
      void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] });
      if (inviteError) {
        setStatus({ message: `${t("owner.professionals.createdInviteFailed")} ${errorMessage(inviteError, t, t("owner.professionals.inviteError"))}`, variant: "error" });
      } else if (invited) {
        // Say it before leaving: this screen goes away with the message.
        setStatus({ message: t("owner.professionals.inviteSentTo", { email: invited }), variant: "success" });
        leaveTimer.current = setTimeout(leave, 1500);
      } else {
        leave();
      }
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("owner.professionals.newTitle")} />
            <Input {...field(0)} label={t("owner.professionals.nameLabel")} onChangeText={setName} placeholder={t("examples.fullName")} testID="professional-name-input" value={name} />
            <Input {...field(1)} autoCapitalize="none" keyboardType="email-address" label={t("owner.professionals.inviteOptional")} onChangeText={setEmail} placeholder={t("examples.email")} testID="professional-invite-email" value={email} />
            {status ? <Text accessibilityLiveRegion="polite" className={`text-sm font-sans-medium ${status.variant === "error" ? "text-danger-500" : "text-success-500"}`} testID="professional-new-status">{status.message}</Text> : null}
            <Button disabled={create.isPending || name.trim().length === 0 || !shopId} label={createdId ? t("owner.professionals.inviteRetry") : t("owner.professionals.add")} onPress={() => create.mutate()} testID="professional-save" />
            {createdId ? <Button label={t("owner.professionals.finish")} onPress={leave} testID="professional-new-finish" variant="outline" /> : null}
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
