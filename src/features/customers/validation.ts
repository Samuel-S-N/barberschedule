import { z } from "zod";

import type { CustomerInput } from "./types";

const optionalTrimmedText = z
  .string()
  .trim()
  .min(1)
  .nullable()
  .optional();

const customerFields = {
  email: optionalTrimmedText.refine(
    (value) => value === null || value === undefined || z.email().safeParse(value).success,
    "Email must be valid.",
  ),
  fullName: z.string().trim().min(1, "Full name is required."),
  phone: optionalTrimmedText,
  shopId: z.string().uuid("Shop id must be a UUID."),
  userId: z
    .string()
    .trim()
    .uuid("User id must be a UUID.")
    .nullable()
    .optional(),
};

const customerSchema = z
  .object({
    ...customerFields,
  })
  .refine(
    (value) =>
      value.userId !== null && value.userId !== undefined
      || value.email !== null && value.email !== undefined
      || value.phone !== null && value.phone !== undefined,
    "Provide an account, email, or phone for the customer.",
  );

const customerUpdateSchema = z
  .object({
    email: customerFields.email,
    fullName: customerFields.fullName,
    phone: customerFields.phone,
    userId: customerFields.userId,
  });

export function parseCustomerInput(input: CustomerInput) {
  const parsed = customerSchema.parse(input);

  return {
    email: parsed.email ?? null,
    fullName: parsed.fullName,
    phone: parsed.phone ?? null,
    shopId: parsed.shopId,
    userId: parsed.userId ?? null,
  };
}

export function parseCustomerUpdateInput(input: Omit<CustomerInput, "shopId">) {
  const parsed = customerUpdateSchema.parse(input);
  const includesEmail = Object.prototype.hasOwnProperty.call(input, "email");
  const includesPhone = Object.prototype.hasOwnProperty.call(input, "phone");
  const includesUserId = Object.prototype.hasOwnProperty.call(input, "userId");

  return {
    fullName: parsed.fullName,
    ...(includesEmail ? { email: parsed.email ?? null } : {}),
    ...(includesPhone ? { phone: parsed.phone ?? null } : {}),
    ...(includesUserId ? { userId: parsed.userId ?? null } : {}),
  };
}

type CustomerFormEligibilityInput = {
  editingId: string | null;
  email: string;
  fullName: string;
  isLoading: boolean;
  isSaving: boolean;
  phone: string;
  shopId: string | null;
};

export function canSubmitCustomerForm({
  editingId,
  email,
  fullName,
  isLoading,
  isSaving,
  phone,
  shopId,
}: CustomerFormEligibilityInput) {
  if (
    fullName.trim().length === 0
    || isLoading
    || isSaving
    || !shopId
  ) {
    return false;
  }

  if (editingId) {
    return true;
  }

  return email.trim().length > 0 || phone.trim().length > 0;
}
