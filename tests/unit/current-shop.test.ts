import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: {} }) }));
jest.mock("../../src/features/shops/api", () => ({ getShopBySlug: jest.fn() }));
jest.mock("../../src/features/shops/host", () => ({ currentShopSlug: jest.fn() }));

import { getShopBySlug } from "../../src/features/shops/api";
import { CurrentShopProvider, useCurrentShop } from "../../src/features/shops/CurrentShopProvider";
import { currentShopSlug } from "../../src/features/shops/host";

const shop = { address_cep: null, address_city: null, address_city_ibge: null, address_complement: null, address_district: null, address_number: null, address_state: null, address_street: null, id: "s1", name: "Barbearia Alfa", phone: null, ready: true, slug: "alfa", whatsapp: null };

function Probe() {
  const value = useCurrentShop();

  return React.createElement(Text, { testID: "probe" }, `${value.status}:${value.slug ?? ""}:${value.shop?.name ?? ""}`);
}

async function renderProvider() {
  // gcTime 0: react-query's default 5-minute GC timer would keep the Jest worker alive.
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });

  return render(React.createElement(QueryClientProvider, { client }, React.createElement(CurrentShopProvider, null, React.createElement(Probe))));
}

describe("CurrentShopProvider", () => {
  afterEach(() => jest.clearAllMocks());

  it("is loading, then ready with the shop", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("alfa");
    // Held open until the "loading" assertion: RNTL's async render can otherwise flush an already-resolved mock first (flaky in CI).
    let resolveShop: (value: typeof shop) => void = () => undefined;
    jest.mocked(getShopBySlug).mockReturnValue(new Promise((resolve) => { resolveShop = resolve; }));
    const view = await renderProvider();

    expect(view.getByTestId("probe").props.children).toBe("loading:alfa:");
    resolveShop(shop);
    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("ready:alfa:Barbearia Alfa"));
    expect(getShopBySlug).toHaveBeenCalledWith({}, "alfa");
  });

  it("keeps the shop when a later refetch fails (a network blip must not drop the app to the error page)", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("alfa");
    jest.mocked(getShopBySlug).mockResolvedValueOnce(shop).mockRejectedValue(new Error("offline"));
    let retry: () => void = () => undefined;
    function Capture() {
      retry = useCurrentShop().retry;

      return null;
    }
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    const view = await render(React.createElement(QueryClientProvider, { client }, React.createElement(CurrentShopProvider, null, React.createElement(Probe), React.createElement(Capture))));

    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("ready:alfa:Barbearia Alfa"));
    retry();
    await waitFor(() => expect(getShopBySlug).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(view.getByTestId("probe").props.children).toBe("ready:alfa:Barbearia Alfa");
  });

  it("reports not-found for an unknown slug", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("ghost");
    jest.mocked(getShopBySlug).mockResolvedValue(null);
    const view = await renderProvider();

    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("not-found:ghost:"));
  });

  it("reports no-slug on the bare domain without querying", async () => {
    jest.mocked(currentShopSlug).mockReturnValue(null);
    const view = await renderProvider();

    expect(view.getByTestId("probe").props.children).toBe("no-slug::");
    expect(getShopBySlug).not.toHaveBeenCalled();
  });

  it("reports error when the lookup fails", async () => {
    jest.mocked(currentShopSlug).mockReturnValue("alfa");
    jest.mocked(getShopBySlug).mockRejectedValue(new Error("offline"));
    const view = await renderProvider();

    await waitFor(() => expect(view.getByTestId("probe").props.children).toBe("error:alfa:"));
  });
});
