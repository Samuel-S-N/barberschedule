import { z } from "zod";

import type { BarberInput } from "./types";

const barberSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  shopId: z.string().uuid("Shop id must be a UUID."),
  userId: z
    .string()
    .trim()
    .uuid("User id must be a UUID.")
    .nullable()
    .optional(),
});

export function parseBarberInput(input: BarberInput) {
  const parsed = barberSchema.parse(input);

  return {
    name: parsed.name,
    shopId: parsed.shopId,
    userId: parsed.userId ?? null,
  };
}

export function parseBarberUpdateInput(input: Omit<BarberInput, "shopId">) {
  const parsed = barberSchema.omit({ shopId: true }).parse(input);
  const includesUserId = Object.prototype.hasOwnProperty.call(input, "userId");

  return {
    name: parsed.name,
    ...(includesUserId ? { userId: parsed.userId ?? null } : {}),
  };
}
