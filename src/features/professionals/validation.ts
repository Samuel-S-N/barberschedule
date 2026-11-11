import { z } from "zod";

import type { ProfessionalCompensation, ProfessionalInput } from "./types";

const professionalSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80, "Name must be at most 80 characters."),
  shopId: z.string().guid("Shop id must be a UUID."),
  userId: z
    .string()
    .trim()
    .guid("User id must be a UUID.")
    .nullable()
    .optional(),
});

export function parseProfessionalInput(input: ProfessionalInput) {
  const parsed = professionalSchema.parse(input);

  return {
    name: parsed.name,
    shopId: parsed.shopId,
    userId: parsed.userId ?? null,
  };
}

export function parseProfessionalUpdateInput(input: Omit<ProfessionalInput, "shopId">) {
  const parsed = professionalSchema.omit({ shopId: true }).parse(input);
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

export function parseCompensationInput(input: unknown): ProfessionalCompensation {
  return compensationSchema.parse(input);
}

const trimmedOrNull = (value: unknown) => (typeof value === "string" ? value.trim() : value);

const professionalProfileSchema = z.object({
  avatarUrl: z
    .preprocess(
      trimmedOrNull,
      z.union([z.literal(""), z.string().regex(/^https?:\/\/\S+$/i, "Avatar must be an http(s) URL.")]),
    )
    .nullable()
    .optional(),
  bio: z.preprocess(trimmedOrNull, z.string().max(500, "Bio must be at most 500 characters.")).nullable().optional(),
});

export function parseProfessionalProfileInput(input: { avatarUrl?: string | null; bio?: string | null }) {
  const parsed = professionalProfileSchema.parse(input);

  return { avatarUrl: parsed.avatarUrl || null, bio: parsed.bio || null };
}
