import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { createElement } from "react";
import type { PropsWithChildren } from "react";

import i18n from "../../src/i18n";
import { EmailRemindersSwitch } from "../../src/features/account/EmailRemindersSwitch";

const mockRpc = jest.fn();
const mockProfile = jest.fn();

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }) }));
jest.mock("../../src/features/account/use-my-profile", () => ({ useMyProfile: () => mockProfile() }));

const clients: QueryClient[] = [];
const renderSwitch = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { gcTime: 0, retry: false }, queries: { gcTime: 0, retry: false } } });

  clients.push(client);
  jest.spyOn(client, "invalidateQueries");

  return { client, view: render(createElement(EmailRemindersSwitch), { wrapper: ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children) }) };
};

afterAll(() => clients.forEach((client) => client.clear()));

describe("EmailRemindersSwitch", () => {
  beforeAll(async () => i18n.changeLanguage("en"));
  beforeEach(() => jest.clearAllMocks());

  it("is on by default and shows the label", async () => {
    mockProfile.mockReturnValue({ data: { emailReminders: true }, isLoading: false });
    const { view } = renderSwitch();
    const screen = await view;

    expect(screen.getByText("E-mail reminders")).toBeTruthy();
    expect(screen.getByTestId("email-reminders-switch").props.value).toBe(true);
  });

  it("an older server without the column counts as on", async () => {
    mockProfile.mockReturnValue({ data: {}, isLoading: false });
    const screen = await renderSwitch().view;

    expect(screen.getByTestId("email-reminders-switch").props.value).toBe(true);
  });

  it("turning it off calls set_email_reminders and refreshes the profile", async () => {
    mockProfile.mockReturnValue({ data: { emailReminders: true }, isLoading: false });
    mockRpc.mockResolvedValue({ data: null, error: null });
    const { client, view } = renderSwitch();
    const screen = await view;

    await fireEvent(screen.getByTestId("email-reminders-switch"), "valueChange", false);

    await waitFor(() => expect(mockRpc).toHaveBeenCalledWith("set_email_reminders", { p_enabled: false }));
    await waitFor(() => expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["my-profile"] }));
  });

  it("shows an error and keeps the stored value when saving fails", async () => {
    mockProfile.mockReturnValue({ data: { emailReminders: true }, isLoading: false });
    mockRpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
    const screen = await renderSwitch().view;

    await fireEvent(screen.getByTestId("email-reminders-switch"), "valueChange", false);

    await waitFor(() => expect(screen.getByText("Could not save. Please try again.")).toBeTruthy());
    expect(screen.getByTestId("email-reminders-switch").props.value).toBe(true);
  });
});
