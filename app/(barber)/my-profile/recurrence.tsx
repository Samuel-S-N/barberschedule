import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { EmptyState } from "../../../src/components/domain/EmptyState";
import { ScreenHeader } from "../../../src/components/domain/ScreenHeader";
import { SkeletonBlock } from "../../../src/components/domain/SkeletonLoader";
import { Toast } from "../../../src/components/domain/Toast";
import { Button } from "../../../src/components/ui/Button";
import { Screen } from "../../../src/components/ui/Screen";
import { searchMyCustomers } from "../../../src/features/appointments/barber-booking";
import { getMyBarberProfile, listMyBarberServices } from "../../../src/features/barbers/api";
import { ManualRecurrenceForm } from "../../../src/features/recurrence/ManualRecurrenceForm";
import { RequestCard } from "../../../src/features/recurrence/RequestCard";
import { decideRecurrenceRequest, listRecurrenceRequests } from "../../../src/features/recurrence/requests-api";
import { errorMessage } from "../../../src/i18n/errors";
import { useBack } from "../../../src/lib/navigation/use-back";
import { pullToRefresh, useRefreshAll } from "../../../src/lib/use-refresh";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

export default function BarberRecurrenceScreen() {
  const { t } = useTranslation();
  const pull = useRefreshAll();
  const back = useBack("/my-profile");
  const queryClient = useQueryClient();
  const { profile, supabase } = useSupabaseSession();
  const [manualOpen, setManualOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; variant: "error" | "success" } | null>(null);

  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const requests = useQuery({
    enabled: Boolean(barber.data),
    queryFn: () => listRecurrenceRequests(supabase, barber.data?.shopId ?? ""),
    queryKey: ["barber-recurrence-requests", barber.data?.shopId],
  });
  const services = useQuery({ queryFn: () => listMyBarberServices(supabase), queryKey: ["my-barber-services"] });
  const customers = useQuery({ enabled: manualOpen, queryFn: () => searchMyCustomers(supabase, term), queryKey: ["barber-customers", term] });

  const decide = useMutation({
    mutationFn: (input: { accept: boolean; id: string }) => decideRecurrenceRequest(supabase, input.id, input.accept),
    onError: (error) => setFeedback({ message: errorMessage(error, t, t("recurrence.decideError")), variant: "error" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["barber-recurrence-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
    },
  });

  return (
    <Screen className="flex-1 bg-canvas" edges={["top", "left", "right"]}>
      <KeyboardAwareScrollView refreshControl={pullToRefresh(pull)} bottomOffset={24} className="flex-1" keyboardShouldPersistTaps="handled">
        <View className="items-center p-5">
          <View className="w-full max-w-[420px] gap-4">
            <ScreenHeader backLabel={t("common.back")} onBack={back} title={t("barber.hub.menu.recurrence")} />
            {requests.isLoading ? <SkeletonBlock height={96} width={320} /> : null}
            {requests.error ? <Text className="text-sm font-sans text-danger-500">{errorMessage(requests.error, t, t("recurrence.decideError"))}</Text> : null}
            {requests.data && requests.data.length === 0 ? <EmptyState title={t("recurrence.noRequests")} /> : null}
            {(requests.data ?? []).map((request) => (
              <RequestCard busy={decide.isPending} key={request.id} onDecide={(accept) => decide.mutate({ accept, id: request.id })} request={request} />
            ))}

            <Button label={t("recurrence.addManual")} onPress={() => setManualOpen((open) => !open)} size="sm" testID="recurring-manual" variant="outline" />
            {manualOpen ? (
              <ManualRecurrenceForm
                customers={(customers.data ?? []).map((customer) => ({ id: customer.id, name: customer.fullName }))}
                onCreated={() => {
                  setManualOpen(false);
                  setFeedback({ message: t("owner.recurring.saved"), variant: "success" });
                }}
                onSearch={setTerm}
                services={(services.data ?? []).filter((service) => service.active).map((service) => ({ barberServiceId: service.barberServiceId, label: service.serviceName }))}
              />
            ) : null}
            <Toast message={feedback?.message ?? ""} onDismiss={() => setFeedback(null)} variant={feedback?.variant ?? "info"} visible={feedback !== null} />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </Screen>
  );
}
