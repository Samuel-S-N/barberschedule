export type EffectiveServiceFieldsInput = {
  durationOverrideMinutes: number | null;
  priceOverrideCents: number | null;
  durationMinutes: number;
  priceCents: number;
};

export type EffectiveServiceFields = {
  durationMinutes: number;
  priceCents: number;
};

export function resolveEffectiveServiceFields(
  input: EffectiveServiceFieldsInput,
): EffectiveServiceFields {
  return {
    durationMinutes: input.durationOverrideMinutes ?? input.durationMinutes,
    priceCents: input.priceOverrideCents ?? input.priceCents,
  };
}
