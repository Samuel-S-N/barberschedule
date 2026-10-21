import { MessageCircle } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { ContactLink } from "../../components/domain/ContactLink";
import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";
import { whatsappUrl } from "../clients/format";
import { recurrenceLabel } from "./pricing";
import { recurrencePriceText } from "./price-text";
import type { StaffRecurrenceRequest } from "./requests-api";

// A pending recurrence request with Accept / Decline; shared by the owner and the barber screens.
export function RequestCard({ busy, onDecide, request }: { busy: boolean; onDecide: (accept: boolean) => void; request: StaffRecurrenceRequest }) {
  const { t } = useTranslation();
  const language = useLanguage();
  const special = request.recurrenceCents;

  return (
    <Card testID={`request-${request.id}`} variant="outlined">
      <View className="gap-2">
        <Text className="text-base font-sans-semibold text-ink">{request.customerName}</Text>
        <Text className="text-sm font-sans text-neutral-600">{request.serviceName} · {request.barberName}</Text>
        <Text className="text-sm font-sans text-neutral-600" style={{ fontVariant: ["tabular-nums"] }}>
          {recurrenceLabel(t, request.weeks)} · {formatDateNumeric(request.startDate, language)} {request.startTime}
        </Text>
        <Text className="text-sm font-sans-medium text-ink">
          {special !== null ? recurrencePriceText(t, special, request.weeks) : t("recurrence.normalPrice", { price: formatPriceBRL(request.normalCents) })}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Button disabled={busy} label={t("recurrence.accept")} onPress={() => onDecide(true)} size="sm" testID={`request-accept-${request.id}`} />
          <Button disabled={busy} label={t("recurrence.reject")} onPress={() => onDecide(false)} size="sm" testID={`request-reject-${request.id}`} variant="danger" />
          {request.customerPhone ? (
            <ContactLink icon={MessageCircle} testID={`request-whatsapp-${request.id}`} url={whatsappUrl(request.customerPhone)}>{t("barber.clients.whatsapp")}</ContactLink>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
