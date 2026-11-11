import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ScreenHeader } from "../../src/components/domain/ScreenHeader";
import { Toast } from "../../src/components/domain/Toast";
import { Button } from "../../src/components/ui/Button";
import { Input, useFieldChain } from "../../src/components/ui/Input";
import { Screen } from "../../src/components/ui/Screen";
import { createProfessional, inviteProfessional } from "../../src/features/professionals/api";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { errorMessage } from "../../src/i18n/errors";
import { useBack } from "../../src/lib/navigation/use-back";
import { useSupabaseSession } from "../../src/providers/AppProviders";

export default function OwnerProfessionalNewScreen() {
  const { t } = useTranslation();
  const back = useBack();
  const field = useFieldChain(2);
  const queryClient = useQueryClient();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const created = await createProfessional(supabase, { name, shopId: shopId ?? "" });

      // The professional exists even if the invite fails; the profile screen can invite again.
      if (email.includes("@")) await inviteProfessional(supabase, { professionalId: created.id, email: email.trim() }).catch(() => undefined);
    },
    onError: (caught) => setError(errorMessage(caught, t, t("owner.professionals.saveError"))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner-professionals"] });
      back();
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
            <Button disabled={create.isPending || name.trim().length === 0 || !shopId} label={t("owner.professionals.add")} onPress={() => create.mutate()} testID="professional-save" />
            <Toast message={error ?? ""} onDismiss={() => setError(null)} variant="error" visible={error !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
