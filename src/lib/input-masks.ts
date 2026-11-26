import type { Language } from "../i18n/language";

const digits = (text: string) => text.replace(/\D/g, "");

export function formatDateInput(input: string, language: Language) {
  const d = digits(input).slice(0, 8);
  const parts = language === "en" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)];

  return parts.filter(Boolean).join(language === "en" ? "-" : "/");
}

export function parseDateInput(display: string, language: Language) {
  const d = digits(display);
  if (d.length !== 8) return null;

  const [year, month, day] = language === "en" ? [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)] : [d.slice(4, 8), d.slice(2, 4), d.slice(0, 2)];
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);

  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function formatTimeInput(input: string) {
  const d = digits(input).slice(0, 4);

  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
}

// 8 digits shown as 00000-000.
export function formatCepInput(input: string) {
  const d = digits(input).slice(0, 8);

  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// Percent (commission): digits and ONE decimal separator (comma or dot), at most 2 decimals (the database stores numeric(5,2)),
// clamped at 100. Returns the value as a plain number string with a dot ("40.5"), which is what the code parses.
export function formatPercentInput(input: string) {
  const cleaned = input.replace(/[^\d.,]/g, "");
  const separator = cleaned.search(/[.,]/);
  const integerPart = (separator === -1 ? cleaned : cleaned.slice(0, separator)).replace(/\D/g, "");
  const decimals = separator === -1 ? "" : cleaned.slice(separator + 1).replace(/\D/g, "").slice(0, 2);
  const integer = integerPart.replace(/^0+(?=\d)/, "") || (separator === -1 ? "" : "0");
  const value = separator === -1 ? integer : `${integer}.${decimals}`;

  return Number(value) > 100 ? "100" : value;
}

// What the field shows: a decimal comma and a % suffix; nothing while empty.
export const percentDisplay = (value: string) => (value ? `${value.replace(".", ",")}%` : "");

// Backspace at the end of "40%" only deletes the "%": that must delete the last digit instead, or the suffix would undo the key press.
export function nextPercentState(previous: string, text: string) {
  if (previous && text === percentDisplay(previous).slice(0, -1)) return formatPercentInput(previous.slice(0, -1));

  return formatPercentInput(text);
}
