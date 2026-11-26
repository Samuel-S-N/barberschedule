import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }));
jest.mock("../../src/features/professionals/api", () => ({ listPublicProfessionals: jest.fn() }));

import type { Appointment } from "../../src/features/appointments/types";
import { useAppointmentCards } from "../../src/features/appointments/use-appointment-cards";
import { listPublicProfessionals } from "../../src/features/professionals/api";
import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import i18n from "../../src/i18n";

const appointment = {
  professionalId: "b1", serviceNameSnapshot: "Corte", shopId: "s1", startsAt: "2026-08-17T12:00:00Z", status: "scheduled",
} as Appointment;

function Probe() {
  const toProps = useAppointmentCards([appointment]);
  const props = toProps(appointment);

  return React.createElement(Text, { testID: "probe" }, JSON.stringify(props));
}

async function renderProbe() {
  // gcTime 0: react-query's default 5-minute GC timer would keep the Jest process alive after the tests finish.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const view = await render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));

  return () => JSON.parse(view.getByTestId("probe").props.children as string) as Record<string, string>;
}

describe("useAppointmentCards", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("uses translated fallbacks while shop and professional names are unknown", async () => {
    jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: null, slug: "alfa", status: "loading" });
    jest.mocked(listPublicProfessionals).mockRejectedValue(new Error("offline"));
    await i18n.changeLanguage("pt");

    const read = await renderProbe();

    expect(read()).toMatchObject({ professionalName: "Profissional", shopName: "Estabelecimento" });
  });

  it("formats the date in the current language and keeps real names", async () => {
    jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: { address_cep: null, address_city: null, address_city_ibge: null, address_complement: null, address_district: null, address_number: null, address_state: null, address_street: null, id: "s1", name: "Barbearia Alfa", phone: null, ready: true, slug: "alfa", whatsapp: null }, slug: "alfa", status: "ready" });
    jest.mocked(listPublicProfessionals).mockResolvedValue([{ id: "b1", name: "João" }] as never);
    await i18n.changeLanguage("pt");

    const read = await renderProbe();

    expect(read().shopName).toBe("Barbearia Alfa");
    await waitFor(() => expect(read().professionalName).toBe("João"));
    expect(read()).toMatchObject({ professionalName: "João", timeLabel: "09:00" });
    expect(read().dateLabel).toMatch(/^seg.*17.*ago/i);
  });
});
