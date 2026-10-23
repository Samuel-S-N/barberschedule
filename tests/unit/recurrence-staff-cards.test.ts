import React from "react";
import { render } from "@testing-library/react-native";

import { CancellationCard } from "../../src/features/recurrence/CancellationCard";
import { RequestCard } from "../../src/features/recurrence/RequestCard";

const request = { barberId: "b1", barberName: "Rafael Souza", customerName: "Carlos Mendes", customerPhone: null, id: "rq1", normalCents: 4500, recurrenceCents: 4000, serviceName: "Corte masculino", startDate: "2026-10-22", startTime: "14:00", weeks: 1 };

describe("RequestCard", () => {
  it("follows the plan card standard when the request has a special price", async () => {
    const view = await render(React.createElement(RequestCard, { busy: false, onDecide: jest.fn(), request }));

    expect(view.getByText(/Corte masculino/)).toBeTruthy();
    expect(view.getByText("R$ 160,00")).toBeTruthy();
    expect(view.getByText("R$ 40,00 per session · 4 sessions in 4 weeks = R$ 160,00")).toBeTruthy();
    expect(view.getByText("Regular price R$ 45,00")).toBeTruthy();
    expect(view.getByText("Carlos Mendes")).toBeTruthy();
    expect(view.getByText("Rafael Souza")).toBeTruthy();
    expect(view.getByText(/14:00/)).toBeTruthy();
  });

  it("shows the regular price as the value, with its label, when there is no special price", async () => {
    const view = await render(React.createElement(RequestCard, { busy: false, onDecide: jest.fn(), request: { ...request, recurrenceCents: null } }));

    expect(view.getByText("R$ 45,00")).toBeTruthy();
    expect(view.getByText("Regular price")).toBeTruthy();
    expect(view.queryByText(/per session/)).toBeNull();
  });
});

describe("CancellationCard", () => {
  it("shows service and periodicity without a value, then customer and barber", async () => {
    const view = await render(React.createElement(CancellationCard, { busy: false, onDecide: jest.fn(), request: { barberName: "Rafael Souza", customerName: "Ana Souza", customerPhone: null, requestedAt: "2026-10-20T10:00:00Z", seriesId: "s1", serviceName: "Corte masculino", weeks: 1 } }));

    expect(view.getByText(/Corte masculino/)).toBeTruthy();
    expect(view.getByText("Ana Souza")).toBeTruthy();
    expect(view.getByText("Rafael Souza")).toBeTruthy();
    expect(view.queryByTestId("plan-amount")).toBeNull();
  });
});
