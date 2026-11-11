export const BOOKING_STEPS = ["professional", "service", "date", "time", "review", "confirm"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type BookingIds = { shopId: string; professionalId?: string; professionalServiceId?: string; localDate?: string };

export const stepNumber = (step: BookingStep) => BOOKING_STEPS.indexOf(step) + 1;

// The route of a step the customer already went through, rebuilt from the choices made so far.
export function stepHref(step: BookingStep, ids: BookingIds) {
  const e = encodeURIComponent;
  const shop = `shopId=${e(ids.shopId)}`;

  if (step === "professional") return `/book/professional?${shop}`;
  if (!ids.professionalId) return null;
  const professional = `${shop}&professionalId=${e(ids.professionalId)}`;
  if (step === "service") return `/book/service?${professional}`;
  if (!ids.professionalServiceId) return null;
  const service = `${professional}&professionalServiceId=${e(ids.professionalServiceId)}`;
  if (step === "date") return `/book/date?${service}`;
  if (step === "time" && ids.localDate) return `/book/time?${service}&localDate=${e(ids.localDate)}`;

  return null;
}
