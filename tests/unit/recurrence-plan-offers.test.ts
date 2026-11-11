import { buildPlanOffers } from "../../src/features/recurrence/plan-offers";
import type { ProfessionalPlan } from "../../src/features/recurrence/plans-api";

const plan = (overrides: Partial<ProfessionalPlan>): ProfessionalPlan => ({
  professionalServiceId: "bs1", name: "Corte mensal", normalCents: 3500, planId: "p-month", priceCents: 2500, serviceName: "Cut", weeks: 1, ...overrides,
});

const professionals = [
  { avatarUrl: null, id: "b1", name: "Bia" },
  { avatarUrl: "https://x/y.png", id: "b2", name: "Caio" },
  { avatarUrl: null, id: "b3", name: "Dani" },
];

it("merges every professional's plans into plan-first offers, listing the professionals that offer each plan", () => {
  const offers = buildPlanOffers(professionals, {
    b1: [plan({}), plan({ professionalServiceId: "bs1c", name: "Corte + Barba", planId: "p-combo", serviceName: "Cut + Beard" })],
    b2: [plan({ professionalServiceId: "bs2" })],
    b3: [],
  });

  expect(offers.map((offer) => offer.planId)).toEqual(["p-month", "p-combo"]);
  expect(offers.find((offer) => offer.planId === "p-month")?.professionals).toEqual([
    { avatarUrl: null, professionalId: "b1", professionalName: "Bia", professionalServiceId: "bs1" },
    { avatarUrl: "https://x/y.png", professionalId: "b2", professionalName: "Caio", professionalServiceId: "bs2" },
  ]);
  expect(offers.find((offer) => offer.planId === "p-combo")?.professionals).toHaveLength(1);
});

it("orders offers by service name, then periodicity", () => {
  const offers = buildPlanOffers(professionals.slice(0, 1), {
    b1: [plan({ planId: "p2", weeks: 2 }), plan({ planId: "p1", weeks: 1 }), plan({ planId: "pa", serviceName: "Beard", weeks: 4 })],
  });

  expect(offers.map((offer) => offer.planId)).toEqual(["pa", "p1", "p2"]);
});

it("no plans, no offers", () => {
  expect(buildPlanOffers(professionals, {})).toEqual([]);
});
