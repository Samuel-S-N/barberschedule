import type { ProfessionalPlan } from "./plans-api";

export type PlanOfferProfessional = { avatarUrl: string | null; professionalId: string; professionalName: string; professionalServiceId: string };
export type PlanOffer = {
  professionals: PlanOfferProfessional[];
  name: string;
  normalCents: number;
  planId: string;
  priceCents: number;
  serviceName: string;
  weeks: number;
};

// Plan-first: each plan appears once, with the professionals who offer it (a plan belongs to a service, a professional offers a service).
export function buildPlanOffers(
  professionals: { avatarUrl: string | null; id: string; name: string }[],
  plansByProfessional: Record<string, ProfessionalPlan[]>,
): PlanOffer[] {
  const offers = new Map<string, PlanOffer>();

  for (const professional of professionals) {
    for (const plan of plansByProfessional[professional.id] ?? []) {
      const offer = offers.get(plan.planId) ?? {
        professionals: [], name: plan.name, normalCents: plan.normalCents, planId: plan.planId, priceCents: plan.priceCents, serviceName: plan.serviceName, weeks: plan.weeks,
      };

      offer.professionals.push({ avatarUrl: professional.avatarUrl, professionalId: professional.id, professionalName: professional.name, professionalServiceId: plan.professionalServiceId });
      offers.set(plan.planId, offer);
    }
  }

  return [...offers.values()].sort((a, b) => a.serviceName.localeCompare(b.serviceName) || a.weeks - b.weeks);
}
