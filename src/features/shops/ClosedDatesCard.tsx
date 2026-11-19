import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { CalendarPopup } from "../../components/domain/CalendarPopup";
import { ConfirmDialog } from "../../components/domain/ConfirmDialog";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";

export type ClosedDatesCardProps = {
  busy: boolean;
  dates: readonly string[];
  disabled: boolean;
  onClose: (date: string) => void;
  onReopen: (date: string) => void;
  today: string;
};

// The shop's closed days (today or later): remove one, or add one through the calendar and a confirmation.
export function ClosedDatesCard({ busy, dates, disabled, onClose, onReopen, today }: ClosedDatesCardProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <>
      <Text accessibilityRole="header" className="text-xl font-display-semibold text-ink">{t("owner.shop.closedTitle")}</Text>
      <Card variant="outlined">
        <View className="gap-3">
          {dates.length === 0 ? <Text className="text-sm font-sans text-neutral-600">{t("owner.shop.closedNone")}</Text> : null}
          {dates.map((date) => (
            <View className="flex-row items-center justify-between gap-2" key={date} testID={`shop-closed-${date}`}>
              <Text className="text-base font-sans-medium text-ink" style={{ fontVariant: ["tabular-nums"] }}>{formatDateNumeric(date, language)}</Text>
              <Button disabled={busy} label={t("owner.shop.reopen")} onPress={() => onReopen(date)} size="sm" testID={`shop-reopen-${date}`} variant="outline" />
            </View>
          ))}
          <Button disabled={busy || disabled} label={t("owner.shop.closedAdd")} onPress={() => setPicking(true)} testID="shop-closed-add" variant="outline" />
        </View>
      </Card>
      <CalendarPopup
        disabledDates={dates}
        min={today}
        onClose={() => setPicking(false)}
        onSelect={(date) => {
          setPicking(false);
          setPicked(date);
        }}
        title={t("owner.shop.closedPickTitle")}
        value={today}
        visible={picking}
      />
      <ConfirmDialog
        body={t("owner.shop.closedConfirmBody", { date: picked ? formatDateNumeric(picked, language) : "" })}
        busy={busy}
        cancelLabel={t("common.cancel")}
        confirmLabel={t("owner.shop.closedConfirm")}
        confirmVariant="dark"
        onCancel={() => setPicked(null)}
        onConfirm={() => {
          if (picked) onClose(picked);
          setPicked(null);
        }}
        title={t("owner.shop.closedConfirmTitle")}
        visible={picked !== null}
      />
    </>
  );
}
