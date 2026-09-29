import { calculateBarberEarnings } from "../../src/features/earnings/calculate";

const rows = [
  { completedCount: 2, grossCents: 10000, serviceId: "s1", serviceName: "Cut" },
  { completedCount: 1, grossCents: 3001, serviceId: "s2", serviceName: "Beard" },
];

describe("calculateBarberEarnings", () => {
  it("applies the commission percent to the gross and rounds to a cent", () => {
    expect(calculateBarberEarnings(rows, { commissionPercent: 40, type: "commission" })).toEqual({
      completedCount: 3,
      earningsCents: 5200,
      grossCents: 13001,
      rentalDue: null,
    });
  });

  it("gives the barber the whole gross on chair rental and reports the rent separately", () => {
    expect(calculateBarberEarnings(rows, { amountCents: 30000, frequency: "monthly", type: "chair_rental" })).toEqual({
      completedCount: 3,
      earningsCents: 13001,
      grossCents: 13001,
      rentalDue: { amountCents: 30000, frequency: "monthly" },
    });
  });

  it("returns zeros for a period without completed appointments", () => {
    expect(calculateBarberEarnings([], { commissionPercent: 50, type: "commission" })).toEqual({
      completedCount: 0,
      earningsCents: 0,
      grossCents: 0,
      rentalDue: null,
    });
  });
});
