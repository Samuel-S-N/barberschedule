import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Card } from "../../src/components/ui/Card";
import { RescheduleFlow } from "../../src/features/appointments/RescheduleFlow";
import { resolveRecurrenceConflict } from "../../src/features/recurrence/api";
import { useLanguage } from "../../src/i18n/use-language";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useSupabaseSession } from "../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// Reschedule one conflicted occurrence of a recurring plan with the same steps as every other booking (see RescheduleFlow).
export default function ConflictRescheduleScreen() {
  const params = useLocalSearchParams<{ barberId?: string; barberServiceId?: string; conflictId?: string; customerName?: string; localStartTime?: string; occurrenceDate?: string; serviceName?: string }>();
  const occurrenceDate = param(params.occurrenceDate);
  const localStartTime = param(params.localStartTime);
  const customerName = param(params.customerName);
  const serviceName = param(params.serviceName);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();

  return (
    <RescheduleFlow
      barberId={param(params.barberId)}
      barberServiceId={param(params.barberServiceId)}
      current={{ localDate: occurrenceDate, localTime: localStartTime }}
      currentCard={(
        <Card testID="conflict-current">
          <View className="gap-1">
            <Text className="text-base font-sans-semibold text-ink">{customerName} · {serviceName}</Text>
            <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(occurrenceDate, language)} {localStartTime}</Text>
          </View>
        </Card>
      )}
      currentLabel={t("owner.conflicts.flowCurrent")}
      currentTitle={t("owner.conflicts.flowTitle")}
      initialDate={occurrenceDate}
      keepLabel={t("owner.conflicts.flowKeep")}
      maxDaysAhead={90}
      onExit={() => router.navigate("/recurrence-conflicts")}
      onMoved={async () => {
        void queryClient.invalidateQueries({ queryKey: ["owner-agenda"] });
        await queryClient.invalidateQueries({ queryKey: ["owner-recurrence-conflicts"] });
        router.navigate({ params: { done: "rescheduled" }, pathname: "/recurrence-conflicts" });
      }}
      submit={(startsAt) => resolveRecurrenceConflict(supabase, { id: param(params.conflictId), startsAt })}
      summaryRows={[
        [t("agendaCard.customer"), customerName],
        [t("book.summary.service"), serviceName],
      ]}
      testPrefix="conflict"
    />
  );
}
