import { useState } from "react";
import { useTranslation } from "react-i18next";

import { formatPhone, phoneDigits } from "../../features/account/phone";
import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";
import { formatCepInput, formatDateInput, formatTimeInput, nextPercentState, parseDateInput, percentDisplay } from "../../lib/input-masks";
import { formatMoneyInput } from "../../lib/money";
import { Input } from "./Input";
import type { InputProps } from "./Input";

type MaskedProps = Omit<InputProps, "onChangeText" | "keyboardType"> & { onChangeValue: (value: string) => void };

// `value` is the stored ISO date, or "" while the typed text is incomplete. The field shows the typed text while it still
// matches `value`, and the language's format of `value` when the parent changes it (e.g. previous/next day buttons).
export function DateInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();
  const language = useLanguage();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      {...rest}
      keyboardType="number-pad"
      onChangeText={(text) => {
        const masked = formatDateInput(text, language);

        setDraft(masked);
        onChangeValue(parseDateInput(masked, language) ?? "");
      }}
      placeholder={placeholder ?? t("examples.date")}
      value={draft !== null && (parseDateInput(draft, language) ?? "") === value ? draft : value ? formatDateNumeric(value, language) : ""}
    />
  );
}

export function TimeInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} keyboardType="number-pad" onChangeText={(text) => onChangeValue(formatTimeInput(text))} placeholder={placeholder ?? t("examples.time")} value={value} />;
}

// `value` may be digits (the stored form), an old formatted value or what the user typed: it is always DISPLAYED as 00000-000.
export function CepInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} keyboardType="number-pad" maxLength={9} onChangeText={(text) => onChangeValue(formatCepInput(text))} placeholder={placeholder ?? t("examples.cep")} value={formatCepInput(value)} />;
}

// Phone / WhatsApp: `value` is the stored DIGITS; the field shows them formatted and reports digits only (any other character typed or
// pasted is dropped, a "+55" prefix too). One behaviour for every phone field in the app.
export function PhoneInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} autoComplete="tel" keyboardType="phone-pad" onChangeText={(text) => onChangeValue(phoneDigits(text))} placeholder={placeholder ?? t("examples.phone")} value={formatPhone(value)} />;
}

// Money (BRL), cents-first: the user types digits and the field fills from the cents ("4500" -> "R$ 45,00"). `value` is the formatted
// text (or the plain "45,00" a screen seeds with centsToReaisInput); read it back with parseReaisToCents.
export function MoneyInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} keyboardType="number-pad" onChangeText={(text) => onChangeValue(formatMoneyInput(text))} placeholder={placeholder ?? t("examples.money")} value={formatMoneyInput(value)} />;
}

// Percent (commission): digits and one decimal separator, at most 2 decimals, clamped at 100, shown with a % suffix. `value` is the plain
// number string with a dot ("40.5"), the same thing the screens parse with Number().
export function PercentInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const { t } = useTranslation();

  return <Input {...rest} keyboardType="decimal-pad" onChangeText={(text) => onChangeValue(nextPercentState(value, text))} placeholder={placeholder ?? t("examples.percent")} value={percentDisplay(value)} />;
}
