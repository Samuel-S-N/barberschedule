import { z } from "zod";

import type { BarberCompensation, BarberInput } from "./types";

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

const compensationSchema = z.discriminatedUnion("type", [
  z.object({
    commissionPercent: z.number().min(0).max(100),
    type: z.literal("commission"),
  }),
  z.object({
    amountCents: z.number().int().positive(),
    frequency: z.enum(["weekly", "monthly"]),
    type: z.literal("chair_rental"),
  }),
]);

export function parseCompensationInput(input: unknown): BarberCompensation {
  return compensationSchema.parse(input);
}

const trimmedOrNull = (value: unknown) => (typeof value === "string" ? value.trim() : value);

const barberProfileSchema = z.object({
  avatarUrl: z
    .preprocess(
      trimmedOrNull,
      z.union([z.literal(""), z.string().regex(/^https?:\/\/\S+$/i, "Avatar must be an http(s) URL.")]),
    )
    .nullable()
    .optional(),
  bio: z.preprocess(trimmedOrNull, z.string().max(500, "Bio must be at most 500 characters.")).nullable().optional(),
});

export function parseBarberProfileInput(input: { avatarUrl?: string | null; bio?: string | null }) {
  const parsed = barberProfileSchema.parse(input);

  return { avatarUrl: parsed.avatarUrl || null, bio: parsed.bio || null };
}
