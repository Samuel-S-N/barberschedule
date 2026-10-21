import type { TFunction } from "i18next";

import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { fourWeekTotalCents, sessionsPer4Weeks } from "./pricing";

export function recurrencePriceText(t: TFunction, priceCents: number, weeks: number) {
  const unit = t("recurrence.perSession", { price: formatPriceBRL(priceCents) });
  const total = fourWeekTotalCents(priceCents, weeks);

  return total === null ? unit : `${unit} · ${t("recurrence.fourWeeks", { count: sessionsPer4Weeks(weeks), total: formatPriceBRL(total) })}`;
}
