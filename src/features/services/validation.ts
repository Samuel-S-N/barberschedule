import { z } from "zod";

import type { BarberServiceInput, ServiceInput } from "./types";

const serviceSchema = z.object({
  description: z.string().trim().min(1).nullable().optional(),
  durationMinutes: z.number().int().positive("Duration must be positive."),
  name: z.string().trim().min(1, "Name is required."),
  priceCents: z.number().int().min(0, "Price cannot be negative."),
  shopId: z.string().uuid("Shop id must be a UUID."),
});

const barberServiceSchema = z.object({
  barberId: z.string().uuid("Barber id must be a UUID."),
  durationOverrideMinutes: z
    .number()
    .int()
    .positive("Duration override must be positive.")
    .nullable()
    .optional(),
  priceOverrideCents: z
    .number()
    .int()
    .min(0, "Price override cannot be negative.")
    .nullable()
    .optional(),
  serviceId: z.string().uuid("Service id must be a UUID."),
  shopId: z.string().uuid("Shop id must be a UUID."),
});

const integerInputPattern = /^-?\d+$/;

export function parseIntegerInput(value: string, label: string) {
  const trimmed = value.trim();

  if (!integerInputPattern.test(trimmed)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return Number.parseInt(trimmed, 10);
}

export function isIntegerInput(value: string) {
  return integerInputPattern.test(value.trim());
}

export function parseServiceInput(input: ServiceInput) {
  const parsed = serviceSchema.parse(input);

  return {
    description: parsed.description ?? null,
    durationMinutes: parsed.durationMinutes,
    name: parsed.name,
    priceCents: parsed.priceCents,
    shopId: parsed.shopId,
  };
}

export function parseBarberServiceInput(input: BarberServiceInput) {
  const parsed = barberServiceSchema.parse(input);

  return {
    barberId: parsed.barberId,
    durationOverrideMinutes: parsed.durationOverrideMinutes ?? null,
    priceOverrideCents: parsed.priceOverrideCents ?? null,
    serviceId: parsed.serviceId,
    shopId: parsed.shopId,
  };
}
