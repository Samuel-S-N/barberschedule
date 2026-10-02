export const LAPSED_DAYS = 45;

export function daysSince(iso: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

// Brazilian numbers: a 10-11 digit local number gets the 55 prefix; 12-13 digits starting with 55 are kept as they are.
function internationalDigits(phone: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");

  if (digits.length >= 10 && digits.length <= 11) return `55${digits}`;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith("55")) return digits;

  return null;
}

export function whatsappUrl(phone: string | null, text?: string) {
  const digits = internationalDigits(phone);

  return digits ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}

export function telUrl(phone: string | null) {
  const digits = internationalDigits(phone);

  return digits ? `tel:+${digits}` : null;
}
