import { useState } from "react";

import { useLanguage } from "../../i18n/use-language";
import { formatDateNumeric } from "../../lib/i18n/format";
import { formatDateInput, formatTimeInput, parseDateInput } from "../../lib/input-masks";
import { Input } from "./Input";
import type { InputProps } from "./Input";

type MaskedProps = Omit<InputProps, "onChangeText" | "keyboardType"> & { onChangeValue: (value: string) => void };

// `value` is the stored ISO date (or "" while the typed text is incomplete); the field shows it in the language's format.
export function DateInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  const language = useLanguage();
  const [draft, setDraft] = useState("");
  const hint = language === "en" ? "YYYY-MM-DD" : "DD/MM/AAAA";

  return (
    <Input
      {...rest}
      keyboardType="number-pad"
      onChangeText={(text) => {
        const masked = formatDateInput(text, language);

        setDraft(masked);
        onChangeValue(parseDateInput(masked, language) ?? "");
      }}
      placeholder={placeholder ?? hint}
      value={value ? formatDateNumeric(value, language) : draft}
    />
  );
}

export function TimeInput({ value, onChangeValue, placeholder, ...rest }: MaskedProps) {
  return <Input {...rest} keyboardType="number-pad" onChangeText={(text) => onChangeValue(formatTimeInput(text))} placeholder={placeholder ?? "HH:MM"} value={value} />;
}
