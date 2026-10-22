import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Card } from "../../src/components/ui/Card";
import { rescheduleAppointment } from "../../src/features/appointments/lifecycle";
import { RescheduleFlow } from "../../src/features/appointments/RescheduleFlow";
import { useLanguage } from "../../src/i18n/use-language";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { formatDateNumeric } from "../../src/lib/i18n/format";
import { useSupabaseSession } from "../../src/providers/AppProviders";

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

// The barber's move: the same steps as the customer's reschedule (see RescheduleFlow).
export default function MoveAppointmentScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string; barberId?: string; barberServiceId?: string; customerName?: string; serviceName?: string; startsAt?: string }>();
  const currentStart = param(params.startsAt);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const language = useLanguage();
  const { supabase } = useSupabaseSession();
  const current = currentStart ? formatInstantInShopTime(new Date(currentStart)) : null;

  const goToAgenda = (moved: boolean) =>
    router.navigate(moved ? { params: { moved: "1" }, pathname: "/my-agenda" } : "/my-agenda");

  return (
    <RescheduleFlow
      barberId={param(params.barberId)}
      barberServiceId={param(params.barberServiceId)}
      current={current}
      currentCard={(
        <Card testID="move-current">
          <View className="gap-1">
            <Text className="text-base font-sans-semibold text-ink">{param(params.customerName)} · {param(params.serviceName)}</Text>
            {current ? <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(current.localDate, language)} {current.localTime}</Text> : null}
          </View>
        </Card>
      )}
      onExit={() => goToAgenda(false)}
      onMoved={async () => {
        void queryClient.invalidateQueries({ queryKey: ["barber-slots"] });
        void queryClient.invalidateQueries({ queryKey: ["barber-report"] });
        await queryClient.invalidateQueries({ queryKey: ["barber-agenda"] });
        goToAgenda(true);
      }}
      submit={(startsAt) => rescheduleAppointment(supabase, param(params.appointmentId), startsAt)}
      summaryRows={[
        [t("agendaCard.customer"), param(params.customerName)],
        [t("book.summary.service"), param(params.serviceName)],
      ]}
      testPrefix="move"
    />
  );
}
