import { useTranslation } from "react-i18next";

import type { CsvLabels } from "./csv";

export function useCsvLabels(): CsvLabels {
  const { t } = useTranslation();

  return {
    barber: t("csv.barber"), barberShare: t("csv.barberShare"), cancelled: t("csv.cancelled"), completed: t("csv.completed"), date: t("csv.date"),
    earnings: t("csv.earnings"), noShow: t("csv.noShow"), rentEstimate: t("csv.rentEstimate"), rentPaid: t("csv.rentPaid"),
    revenue: t("csv.revenue"), service: t("csv.service"), upcoming: t("csv.upcoming"),
  };
}
