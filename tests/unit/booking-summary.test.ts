import { render } from "@testing-library/react-native";
import React from "react";

import { BookingSummary } from "../../src/components/domain/BookingSummary";
import i18n from "../../src/i18n";

describe("BookingSummary", () => {
  beforeAll(async () => i18n.changeLanguage("en"));

  it("shows barber, service, duration, price and date", async () => {
    const view = await render(
      React.createElement(BookingSummary, {
        barberName: "João",
        dateLabel: "17/08/2026",
        durationMinutes: 45,
        priceCents: 5500,
        serviceName: "Corte",
      }),
    );

    for (const text of ["João", "Corte", "45 min", "R$ 55,00", "17/08/2026"]) {
      expect(view.getByText(text)).toBeTruthy();
    }
  });
});
