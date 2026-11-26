import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { createElement } from "react";
import type { PropsWithChildren } from "react";

import i18n from "../../src/i18n";
import { SetupAgreementStep } from "../../src/features/setup/SetupAgreementStep";

const mockAccept = jest.fn();

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ session: { user: { id: "u1" } }, supabase: { id: "client" } }) }));
jest.mock("../../src/features/legal/api", () => ({ acceptLegalDocuments: (...args: unknown[]) => mockAccept(...args) }));

describe("SetupAgreementStep", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => jest.clearAllMocks());

  it("accepting records the business agreement AND invalidates the consents the re-accept gate reads", async () => {
    mockAccept.mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: 0, retry: false } } });
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const onAccepted = jest.fn();
    const view = await render(createElement(SetupAgreementStep, { done: false, onAccepted }), { wrapper: ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children) });

    await fireEvent.press(view.getByTestId("setup-agreement-accept"));

    await waitFor(() => expect(mockAccept).toHaveBeenCalledWith({ id: "client" }, ["business"]));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["my-consents", "u1"] }));
    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    client.clear();
  });
});
