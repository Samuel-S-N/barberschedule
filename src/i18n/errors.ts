import { DomainError } from "../lib/errors/domain-errors";

const AUTH_CODES = new Set([
  "email_not_confirmed",
  "invalid_credentials",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "user_already_exists",
  "weak_password",
]);

export function errorMessage(error: unknown, t: (key: string) => string, fallback: string) {
  if (error instanceof DomainError) {
    return t(`errors.codes.${error.code}`);
  }

  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === "string" && AUTH_CODES.has(code) ? t(`errors.auth.${code}`) : fallback;
}
