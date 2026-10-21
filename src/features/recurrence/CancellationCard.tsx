import { MessageCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { ContactLink } from "../../components/domain/ContactLink";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { whatsappUrl } from "../clients/format";
import { recurrenceLabel } from "./pricing";
import type { CancellationRequest } from "./requests-api";

// A customer asked to cancel an active plan: Accept ends it, Keep plan declines. Shared by the owner and barber screens.
export function CancellationCard({ busy, onDecide, request }: { busy: boolean; onDecide: (accept: boolean) => void; request: CancellationRequest }) {
  const { t } = useTranslation();

  return (
    <Card testID={`cancellation-${request.seriesId}`} variant="outlined">
      <View className="gap-2">
        <Text className="text-base font-sans-semibold text-ink">{request.customerName}</Text>
        <Text className="text-sm font-sans text-neutral-600">{request.serviceName} · {request.barberName}</Text>
        <Text className="text-sm font-sans text-neutral-600">{recurrenceLabel(t, request.weeks)}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Button disabled={busy} label={t("recurrence.acceptCancellation")} onPress={() => onDecide(true)} size="sm" testID={`cancellation-accept-${request.seriesId}`} variant="danger" />
          <Button disabled={busy} label={t("recurrence.keepPlan")} onPress={() => onDecide(false)} size="sm" testID={`cancellation-decline-${request.seriesId}`} variant="outline" />
          {request.customerPhone ? (
            <ContactLink icon={MessageCircle} testID={`cancellation-whatsapp-${request.seriesId}`} url={whatsappUrl(request.customerPhone)}>{t("barber.clients.whatsapp")}</ContactLink>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
