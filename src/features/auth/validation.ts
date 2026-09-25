import { z } from "zod";

export type SignupInput = {
  acceptedTerms: true;
  email: string;
  fullName: string;
  password: string;
  phone: string | null;
};

// Error messages are translation keys; the screen translates them with t().
const signupSchema = z.object({
  acceptedTerms: z.literal(true, { error: "auth.validation.acceptTerms" }),
  email: z.string().trim().toLowerCase().pipe(z.email("auth.validation.email")),
  fullName: z.string().trim().min(2, "auth.validation.fullName"),
  password: z.string().min(8, "auth.validation.password"),
  phone: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || /^[0-9+()\s-]{8,20}$/.test(value), "auth.validation.phone"),
});

export function parseSignupInput(input: unknown):
  | { ok: true; value: SignupInput }
  | { errors: Partial<Record<keyof SignupInput, string>>; ok: false } {
  const parsed = signupSchema.safeParse(input);

  if (parsed.success) {
    return { ok: true, value: parsed.data as SignupInput };
  }

  const errors: Partial<Record<keyof SignupInput, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof SignupInput;
    errors[key] ??= issue.message;
  }

  return { errors, ok: false };
}
