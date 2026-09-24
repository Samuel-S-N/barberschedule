import { z } from "zod";

export type SignupInput = {
  acceptedTerms: true;
  email: string;
  fullName: string;
  password: string;
  phone: string | null;
};

const signupSchema = z.object({
  acceptedTerms: z.literal(true, { error: "Accept the terms and privacy policy to continue." }),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email.")),
  fullName: z.string().trim().min(2, "Enter your full name."),
  password: z.string().min(8, "Use at least 8 characters."),
  phone: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : value))
    .refine((value) => value === null || /^[0-9+()\s-]{8,20}$/.test(value), "Enter a valid phone number."),
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
