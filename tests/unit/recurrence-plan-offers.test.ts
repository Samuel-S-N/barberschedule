import { buildPlanOffers } from "../../src/features/recurrence/plan-offers";
import type { BarberPlan } from "../../src/features/recurrence/plans-api";

const plan = (overrides: Partial<BarberPlan>): BarberPlan => ({
  barberServiceId: "bs1", name: "Corte mensal", normalCents: 3500, planId: "p-month", priceCents: 2500, serviceName: "Cut", weeks: 1, ...overrides,
});

const barbers = [
  { avatarUrl: null, id: "b1", name: "Bia" },
  { avatarUrl: "https://x/y.png", id: "b2", name: "Caio" },
  { avatarUrl: null, id: "b3", name: "Dani" },
];

it("merges every barber's plans into plan-first offers, listing the barbers that offer each plan", () => {
  const offers = buildPlanOffers(barbers, {
    b1: [plan({}), plan({ barberServiceId: "bs1c", name: "Corte + Barba", planId: "p-combo", serviceName: "Cut + Beard" })],
    b2: [plan({ barberServiceId: "bs2" })],
    b3: [],
  });

  expect(offers.map((offer) => offer.planId)).toEqual(["p-month", "p-combo"]);
  expect(offers.find((offer) => offer.planId === "p-month")?.barbers).toEqual([
    { avatarUrl: null, barberId: "b1", barberName: "Bia", barberServiceId: "bs1" },
    { avatarUrl: "https://x/y.png", barberId: "b2", barberName: "Caio", barberServiceId: "bs2" },
  ]);
  expect(offers.find((offer) => offer.planId === "p-combo")?.barbers).toHaveLength(1);
});

it("orders offers by service name, then periodicity", () => {
  const offers = buildPlanOffers(barbers.slice(0, 1), {
    b1: [plan({ planId: "p2", weeks: 2 }), plan({ planId: "p1", weeks: 1 }), plan({ planId: "pa", serviceName: "Beard", weeks: 4 })],
  });

  expect(offers.map((offer) => offer.planId)).toEqual(["pa", "p1", "p2"]);
});

it("no plans, no offers", () => {
  expect(buildPlanOffers(barbers, {})).toEqual([]);
});
