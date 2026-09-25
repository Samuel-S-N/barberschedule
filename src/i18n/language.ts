export type Language = "pt" | "en" | "es";

export function resolveLanguage(code: string | null | undefined): Language {
  const base = (code ?? "").toLowerCase().split(/[-_]/)[0];

  return base === "pt" || base === "es" ? base : "en";
}
