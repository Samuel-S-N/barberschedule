// Brazilian phone numbers are STORED as digits only (DDD + 8 or 9 digits) and shown formatted: (00) 00000-0000 with 11 digits,
// (00) 0000-0000 with 10, progressively while typing. Old stored values like "(11)91234-5678" are read through the same functions.
export function phoneDigits(input: string) {
  let digits = input.replace(/\D/g, "");

  // A pasted "+55 ..." / "55..." country code is not part of the stored number.
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);

  return digits.slice(0, 11);
}

export function formatPhone(input: string) {
  const digits = phoneDigits(input);

  if (digits.length <= 2) return digits ? `(${digits}` : "";

  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = digits.length === 11 ? 5 : 4;

  return rest.length <= split ? `(${area}) ${rest}` : `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}
