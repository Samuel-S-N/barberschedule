import { useMutation } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { Toast } from "../../components/domain/Toast";
import { Button } from "../../components/ui/Button";
import { errorMessage } from "../../i18n/errors";
import { useSupabaseSession } from "../../providers/AppProviders";
import { acceptLegalDocuments } from "../legal/api";
import { SetupStepCard } from "./SetupStepCard";

// Step 1: read the business agreement (the public /contrato page) and accept it here. The server checks the consent exists.
export function SetupAgreementStep({ done, onAccepted }: { done: boolean; onAccepted: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const accept = useMutation({ mutationFn: () => acceptLegalDocuments(supabase, ["business"]), onSuccess: onAccepted });

  return (
    <SetupStepCard done={done} hint={t("setup.agreement.hint")} stepKey="agreement" title={t("setup.agreement.title")}>
      <Button label={t("setup.agreement.read")} onPress={() => router.push("/contrato" as never)} size="sm" testID="setup-agreement-read" variant="outline" />
      {done ? null : <Button disabled={accept.isPending} label={t("setup.agreement.accept")} onPress={() => accept.mutate()} size="sm" testID="setup-agreement-accept" />}
      <Toast message={accept.isError ? errorMessage(accept.error, t, t("legal.gate.error")) : ""} onDismiss={() => accept.reset()} variant="error" visible={accept.isError} />
    </SetupStepCard>
  );
}
