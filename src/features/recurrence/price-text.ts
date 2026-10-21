import type { TFunction } from "i18next";

import { formatPriceBRL } from "../../components/domain/ServiceCard";
import { fourWeekTotalCents, sessionsPer4Weeks } from "./pricing";

export function recurrencePriceText(t: TFunction, priceCents: number, weeks: number) {
  const unit = t("recurrence.perSession", { price: formatPriceBRL(priceCents) });
  const total = fourWeekTotalCents(priceCents, weeks);

  return total === null ? unit : `${unit} · ${t("recurrence.fourWeeks", { count: sessionsPer4Weeks(weeks), total: formatPriceBRL(total) })}`;
}

// What a plan card shows: the plan's value for 4 weeks (a "month") and how many sessions it covers. When 4 weeks is not a
// whole number of sessions (every 3, 5... weeks) there is no monthly total: the price per session stands in for the value.
export function planValue(t: TFunction, priceCents: number, weeks: number) {
  const total = fourWeekTotalCents(priceCents, weeks);

  return total === null
    ? { amountCents: priceCents, caption: t("recurrence.perSessionCaption") }
    : { amountCents: total, caption: t("recurrence.sessionsPerMonth", { count: sessionsPer4Weeks(weeks) }) };
}
