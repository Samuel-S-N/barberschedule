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
