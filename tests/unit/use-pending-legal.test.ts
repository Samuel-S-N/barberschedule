import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { createElement } from "react";
import type { PropsWithChildren } from "react";

import { LEGAL_VERSIONS } from "../../src/features/legal";
import { usePendingLegal } from "../../src/features/legal/use-pending-legal";

const mockSession = jest.fn();
const mockList = jest.fn();

jest.mock("../../src/providers/AppProviders", () => ({ useSupabaseSession: () => mockSession() }));
jest.mock("../../src/features/legal/api", () => ({ listMyConsents: (...args: unknown[]) => mockList(...args) }));

const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
const withMetadata = (user_metadata: Record<string, unknown>) =>
  mockSession.mockReturnValue({ profile: { role: "customer", userId: "u1" }, session: { user: { id: "u1", user_metadata } }, supabase: {} });

afterAll(() => client.clear());
beforeEach(() => client.clear());

describe("usePendingLegal and the signup acceptance", () => {
  it("a brand-new customer (no consent rows yet, current versions in the signup metadata) has nothing pending", async () => {
    mockList.mockResolvedValue([]);
    withMetadata({ accepted_privacy_version: LEGAL_VERSIONS.privacy, accepted_terms_version: LEGAL_VERSIONS.terms });

    const { result } = await renderHook(() => usePendingLegal(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending).toEqual([]);
  });

  it("an old version in the metadata still counts as pending", async () => {
    mockList.mockResolvedValue([]);
    withMetadata({ accepted_terms_version: "2026-09-23" });

    const { result } = await renderHook(() => usePendingLegal(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending).toEqual(["terms", "privacy"]);
  });

  it("no metadata and no rows (an invited owner or professional) is pending", async () => {
    mockList.mockResolvedValue([]);
    withMetadata({});

    const { result } = await renderHook(() => usePendingLegal(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.pending).toEqual(["terms", "privacy"]);
  });
});
