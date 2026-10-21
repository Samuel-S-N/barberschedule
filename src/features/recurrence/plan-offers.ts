import type { BarberPlan } from "./plans-api";

export type PlanOfferBarber = { avatarUrl: string | null; barberId: string; barberName: string; barberServiceId: string };
export type PlanOffer = {
  barbers: PlanOfferBarber[];
  name: string;
  normalCents: number;
  planId: string;
  priceCents: number;
  serviceName: string;
  weeks: number;
};

// Plan-first: each plan appears once, with the barbers who offer it (a plan belongs to a service, a barber offers a service).
export function buildPlanOffers(
  barbers: { avatarUrl: string | null; id: string; name: string }[],
  plansByBarber: Record<string, BarberPlan[]>,
): PlanOffer[] {
  const offers = new Map<string, PlanOffer>();

  for (const barber of barbers) {
    for (const plan of plansByBarber[barber.id] ?? []) {
      const offer = offers.get(plan.planId) ?? {
        barbers: [], name: plan.name, normalCents: plan.normalCents, planId: plan.planId, priceCents: plan.priceCents, serviceName: plan.serviceName, weeks: plan.weeks,
      };

      offer.barbers.push({ avatarUrl: barber.avatarUrl, barberId: barber.id, barberName: barber.name, barberServiceId: plan.barberServiceId });
      offers.set(plan.planId, offer);
    }
  }

  return [...offers.values()].sort((a, b) => a.serviceName.localeCompare(b.serviceName) || a.weeks - b.weeks);
}
