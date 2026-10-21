import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";
import { formatDateInput, formatTimeInput, parseDateInput } from "../../lib/input-masks";
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
