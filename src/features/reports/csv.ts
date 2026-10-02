import type { ShopReport } from "../owner-reports/build";
import type { BarberReport } from "./build-report";

export type CsvLabels = {
  barber: string; barberShare: string; cancelled: string; completed: string; date: string; earnings: string; noShow: string;
  rentEstimate: string; rentPaid: string; revenue: string; service: string; upcoming: string;
};

type Cell = number | string;

// ';' delimiter, decimal comma and a BOM: what Brazilian Excel/Sheets locales open without the import wizard.
const BOM = "﻿";

const escapeCell = (cell: Cell) => {
  // A leading =, +, - or @ would run as a formula in a spreadsheet: a text cell (e.g. a service name) must not.
  const text = typeof cell === "string" && /^[=+\-@]/.test(cell) ? `'${cell}` : String(cell);

  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(rows: Cell[][]) {
  return BOM + rows.map((row) => row.map(escapeCell).join(";")).join("\r\n");
}

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function ownerReportCsv(report: ShopReport, l: CsvLabels) {
  return toCsv([
    [l.date, l.completed, l.cancelled, l.noShow, l.upcoming, l.revenue],
    ...report.days.map((d) => [d.date, d.completed, d.cancelled, d.noShow, d.upcoming, reais(d.grossCents)]),
    [],
    [l.barber, l.completed, l.revenue, l.barberShare, l.rentEstimate, l.rentPaid],
    ...report.barbers.map((b) => [b.name, b.completed, reais(b.grossCents), reais(b.barberShareCents), reais(b.rentEstimateCents), reais(b.rentPaidCents)]),
    [],
    [l.service, l.completed, l.revenue],
    ...report.services.map((s) => [s.name, s.completed, reais(s.grossCents)]),
  ]);
}

export function barberReportCsv(report: BarberReport, l: CsvLabels) {
  return toCsv([
    [l.date, l.completed, l.cancelled, l.noShow, l.upcoming, l.earnings],
    ...report.days.map((d) => [d.date, d.completed, d.cancelled, d.noShow, d.upcoming, reais(d.earningsCents)]),
    [],
    [l.service, l.completed],
    ...report.services.map((s) => [s.name, s.completed]),
  ]);
}
