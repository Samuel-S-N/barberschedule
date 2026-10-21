export const BOOKING_STEPS = ["barber", "service", "date", "time", "review", "confirm"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type BookingIds = { shopId: string; barberId?: string; barberServiceId?: string; localDate?: string };

export const stepNumber = (step: BookingStep) => BOOKING_STEPS.indexOf(step) + 1;

// The route of a step the customer already went through, rebuilt from the choices made so far.
export function stepHref(step: BookingStep, ids: BookingIds) {
  const e = encodeURIComponent;
  const shop = `shopId=${e(ids.shopId)}`;

  if (step === "barber") return `/book/barber?${shop}`;
  if (!ids.barberId) return null;
  const barber = `${shop}&barberId=${e(ids.barberId)}`;
  if (step === "service") return `/book/service?${barber}`;
  if (!ids.barberServiceId) return null;
  const service = `${barber}&barberServiceId=${e(ids.barberServiceId)}`;
  if (step === "date") return `/book/date?${service}`;
  if (step === "time" && ids.localDate) return `/book/time?${service}&localDate=${e(ids.localDate)}`;

  return null;
}
