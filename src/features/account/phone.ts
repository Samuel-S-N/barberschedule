// Brazilian mobile/landline mask, applied while typing: (DD)NNNNN-NNNN with 11 digits, (DD)NNNN-NNNN with 10.
export function formatPhone(input: string) {
  let digits = input.replace(/\D/g, "");

  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : "";

  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = digits.length === 11 ? 5 : 4;

  return rest.length <= split ? `(${area})${rest}` : `(${area})${rest.slice(0, split)}-${rest.slice(split)}`;
}
