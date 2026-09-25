import { en } from "./locales/en";

// The resource groups double as the list of known error codes: a code is translated
// when some group defines it. DomainError, ScheduleError, AvailabilityError and
// Supabase auth errors all expose a string `code`.
const GROUPS = ["codes", "schedule", "availability", "auth"] as const;

export function errorMessage(error: unknown, t: (key: string) => string, fallback: string) {
  const code = (error as { code?: unknown } | null)?.code;

  if (typeof code === "string") {
    for (const group of GROUPS) {
      if (Object.prototype.hasOwnProperty.call(en.errors[group], code)) {
        return t(`errors.${group}.${code}`);
      }
    }
  }

  return error instanceof RangeError ? t("errors.invalidDateTime") : fallback;
}
