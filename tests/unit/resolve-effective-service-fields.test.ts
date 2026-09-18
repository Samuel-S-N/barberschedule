import { resolveEffectiveServiceFields } from "../../src/features/services/resolve-effective-fields";

describe("resolveEffectiveServiceFields", () => {
  it("uses the base duration and price when no override is set", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: null, priceCents: 4000, priceOverrideCents: null,
    })).toEqual({ durationMinutes: 30, priceCents: 4000 });
  });

  it("uses the duration override when set, independent of price", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: 45, priceCents: 4000, priceOverrideCents: null,
    })).toEqual({ durationMinutes: 45, priceCents: 4000 });
  });

  it("uses the price override when set, independent of duration", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: null, priceCents: 4000, priceOverrideCents: 5500,
    })).toEqual({ durationMinutes: 30, priceCents: 5500 });
  });

  it("uses both overrides when both are set", () => {
    expect(resolveEffectiveServiceFields({
      durationMinutes: 30, durationOverrideMinutes: 45, priceCents: 4000, priceOverrideCents: 5500,
    })).toEqual({ durationMinutes: 45, priceCents: 5500 });
  });
});
