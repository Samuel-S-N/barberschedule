import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/api", () => ({ listShopHours: jest.fn() }));
jest.mock("../../src/features/shops/CurrentShopProvider", () => ({ useCurrentShop: jest.fn() }));

import { useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { listShopHours } from "../../src/features/shops/api";
import { useShopInfo } from "../../src/features/shops/use-shop-info";

function Probe() {
  const { hours, shop } = useShopInfo();

  return React.createElement(Text, { testID: "probe" }, `${shop?.name ?? "none"}:${hours.length}`);
}

it("returns the current shop and its hours, not the first shop by name", async () => {
  jest.mocked(useCurrentShop).mockReturnValue({ retry: jest.fn(), shop: { id: "s2", name: "Beta", slug: "beta" }, slug: "beta", status: "ready" } as never);
  jest.mocked(listShopHours).mockResolvedValue([{ end: "18:00", start: "09:00", weekday: 1 }]);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const view = await render(React.createElement(QueryClientProvider, { client }, React.createElement(Probe)));

  await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("Beta:1"));
  expect(listShopHours).toHaveBeenCalledWith({}, "s2");
});
