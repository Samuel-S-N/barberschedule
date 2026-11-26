// "300", "300,50", "1.250,00", "R$ 75,90" -> cents. Null for anything that is not a positive amount with at most 2 decimals.
export function parseReaisToCents(input: string): number | null {
  const cleaned = input.replace(/R\$/gi, "").replace(/\s/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);

  return cents > 0 ? cents : null;
}

// Cents -> what the owner types into a reais field: decimal comma, no thousands grouping.
export function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

// The money field's mask: cents-first, the way a card machine works. The user types digits and the field fills from the cents:
// 4500 -> "R$ 45,00", 123456 -> "R$ 1.234,56"; backspace drops the last digit; nothing (or only zeros) is "" (never "R$ 0,00").
// Any text is read as digits, so an already formatted value ("45,00" from centsToReaisInput, "R$ 1.250,00" pasted) formats the same.
// At most 9 digits (R$ 9.999.999,99), well inside the integer the database stores. parseReaisToCents reads the result back.
export function formatMoneyInput(text: string): string {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "").slice(0, 9);

  if (!digits) return "";

  const padded = digits.padStart(3, "0");
  const reais = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `R$ ${reais},${padded.slice(-2)}`;
}
