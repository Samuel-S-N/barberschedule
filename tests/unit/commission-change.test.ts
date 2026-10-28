import { needsCommissionChoice } from "../../src/features/barbers/commission-change";

describe("needsCommissionChoice", () => {
  it("asks when a commission barber gets a different percent", () => {
    expect(needsCommissionChoice({ commissionPercent: 40, type: "commission" }, { commissionPercent: 50, type: "commission" })).toBe(true);
  });

  it("does not ask when the percent is unchanged", () => {
    expect(needsCommissionChoice({ commissionPercent: 40, type: "commission" }, { commissionPercent: 40, type: "commission" })).toBe(false);
  });

  it("does not ask when coming from chair rental (there is no earlier commission)", () => {
    expect(needsCommissionChoice({ amountCents: 30000, frequency: "monthly", type: "chair_rental" }, { commissionPercent: 40, type: "commission" })).toBe(false);
  });

  it("does not ask when moving to chair rental", () => {
    expect(needsCommissionChoice({ commissionPercent: 40, type: "commission" }, { amountCents: 30000, frequency: "monthly", type: "chair_rental" })).toBe(false);
  });
});
