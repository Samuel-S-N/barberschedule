import { z } from "zod";

import type { RecurrenceSeriesInput } from "./types";

const recurrenceSeriesSchema = z.object({
  barberServiceId: z.string().uuid(),
  customerId: z.string().uuid(),
  intervalWeeks: z.number().int().positive(),
  localStartDate: z.iso.date(),
  localStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  specialPriceCents: z.number().int().nonnegative().nullable().optional(),
});

export function parseRecurrenceSeriesInput(input: RecurrenceSeriesInput) {
  const parsed = recurrenceSeriesSchema.parse(input);

  return {
    ...parsed,
    specialPriceCents: parsed.specialPriceCents ?? null,
  };
}
