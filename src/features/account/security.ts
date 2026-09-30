import { z } from "zod";

export function isValidEmail(value: string) {
  return z.email().safeParse(value.trim()).success;
}

export function validateNewPassword(next: string, confirm: string) {
  if (next.length < 8) return "password" as const;
  if (next !== confirm) return "mismatch" as const;

  return null;
}
