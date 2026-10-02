import type { DonutItem } from "../reports/build-report";

export type ShopDay = { cancelled: number; completed: number; date: string; grossCents: number; noShow: number; upcoming: number };
export type ShopBarber = {
  barberId: string; barberShareCents: number; compensationType: "chair_rental" | "commission"; completed: number;
  grossCents: number; name: string; rentEstimateCents: number; rentPaidCents: number;
};
export type ShopService = { completed: number; grossCents: number; name: string; serviceId: string };
export type ShopReport = { barbers: ShopBarber[]; days: ShopDay[]; services: ShopService[] };
export type ShopTotals = {
  barberShareCents: number; cancelled: number; cancellationRate: number | null; completed: number; grossCents: number;
  noShow: number; rentEstimateCents: number; rentPaidCents: number; shopIncomeCents: number;
};

export function sumShopReport(report: ShopReport): ShopTotals {
  const days = report.days.reduce(
    (sum, d) => ({ cancelled: sum.cancelled + d.cancelled, completed: sum.completed + d.completed, grossCents: sum.grossCents + d.grossCents, noShow: sum.noShow + d.noShow }),
    { cancelled: 0, completed: 0, grossCents: 0, noShow: 0 },
  );
  const barberShareCents = report.barbers.reduce((sum, b) => sum + b.barberShareCents, 0);
  const rentEstimateCents = report.barbers.reduce((sum, b) => sum + b.rentEstimateCents, 0);
  const rentPaidCents = report.barbers.reduce((sum, b) => sum + b.rentPaidCents, 0);
  const closed = days.completed + days.cancelled + days.noShow;

  return {
    ...days,
    barberShareCents,
    cancellationRate: closed === 0 ? null : (days.cancelled + days.noShow) / closed,
    rentEstimateCents,
    rentPaidCents,
    shopIncomeCents: days.grossCents - barberShareCents + rentEstimateCents,
  };
}

export function barberRows(report: ShopReport) {
  return report.barbers.map((b) => ({ ...b, shopShareCents: b.grossCents - b.barberShareCents + b.rentEstimateCents }));
}

export function topByValue(items: Array<{ key: string; name: string; value: number }>, max = 4): DonutItem[] {
  const sorted = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const head = sorted.slice(0, max).map((i) => ({ key: i.key, name: i.name, value: i.value }));
  const rest = sorted.slice(max).reduce((sum, i) => sum + i.value, 0);

  return rest > 0 ? [...head, { key: "other", name: "", value: rest }] : head;
}
