const digits = (value: string) => value.replace(/\D/g, "");

export function telUrl(phone: string) {
  const number = digits(phone);

  return number ? `tel:${phone.trim().startsWith("+") ? "+" : ""}${number}` : null;
}

export function whatsappUrl(value: string) {
  const number = digits(value);
  if (!number) return null;

  // National Brazilian numbers (DDD + 8/9 digits) get the country code.
  return `https://wa.me/${number.length <= 11 ? `55${number}` : number}`;
}
