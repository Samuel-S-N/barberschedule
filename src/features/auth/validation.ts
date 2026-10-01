import { z } from "zod";

export type SignupInput = {
  acceptedTerms: true;
  email: string;
  fullName: string;
  nickname: string | null;
  password: string;
  phone: string | null;
};

// Error messages are translation keys; the screen translates them with t().
const signupSchema = z
  .object({
  acceptedTerms: z.literal(true, { error: "auth.validation.acceptTerms" }),
  email: z.string().trim().toLowerCase().pipe(z.email("auth.validation.email")),
  fullName: z.string().trim().min(2, "auth.validation.fullName"),
  nickname: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || value.length <= 30, "auth.validation.nickname"),
  password: z.string().min(8, "auth.validation.password"),
  phone: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || /^[0-9+()\s-]{8,20}$/.test(value), "auth.validation.phone"),
  confirmPassword: z.string(),
})
  .refine((value) => value.password === value.confirmPassword, {
    error: "auth.validation.passwordMismatch",
    path: ["confirmPassword"],
  });

export function parseSignupInput(input: unknown):
  | { ok: true; value: SignupInput }
  | { errors: Partial<Record<keyof SignupInput | "confirmPassword", string>>; ok: false } {
  const parsed = signupSchema.safeParse(input);

  if (parsed.success) {
    // The confirmation only exists to be compared; it never leaves validation.
    const value: Record<string, unknown> = { ...parsed.data };
    delete value.confirmPassword;

    return { ok: true, value: value as SignupInput };
  }

  const errors: Partial<Record<keyof SignupInput | "confirmPassword", string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof SignupInput | "confirmPassword";
    errors[key] ??= issue.message;
  }

  return { errors, ok: false };
}
