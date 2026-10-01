import type { Session } from "@supabase/supabase-js";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

jest.mock("../../src/features/auth/api", () => ({
  getCurrentProfile: jest.fn(),
}));

jest.mock("../../src/lib/supabase/client", () => ({
  getSupabaseBrowserClient: jest.fn(),
}));

import { getCurrentProfile } from "../../src/features/auth/api";
import { clearRecovery, hasRecovery } from "../../src/features/auth/recovery";
import { useSupabaseSession, AppProviders } from "../../src/providers/AppProviders";
import { getSupabaseBrowserClient } from "../../src/lib/supabase/client";

type ProfileSnapshot = {
  role: "customer" | "owner";
  userId: string;
};

type AuthStateChangeCallback = (
  event: string,
  session: Session | null,
) => void;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function createSession(userId: string) {
  return {
    access_token: `token-${userId}`,
    refresh_token: `refresh-${userId}`,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId },
  } as Session;
}

function createSupabaseStub(initialSession: Session | null) {
  let authStateCallback: AuthStateChangeCallback | null = null;

  return {
    client: {
      auth: {
        getSession: jest.fn().mockResolvedValue({ data: { session: initialSession } }),
        onAuthStateChange: jest.fn((callback: AuthStateChangeCallback) => {
          authStateCallback = callback;

          return {
            data: {
              subscription: {
                unsubscribe: jest.fn(),
              },
            },
          };
        }),
      },
      rpc: jest.fn(),
    },
    emit(session: Session | null, event = "SIGNED_IN") {
      if (!authStateCallback) {
        throw new Error("Auth state callback not registered");
      }

      authStateCallback(event, session);
    },
  };
}

function SessionProbe() {
  const { isLoading, profile, session } = useSupabaseSession();

  return React.createElement(
    Text,
    null,
    `${isLoading ? "loading" : "idle"}|${session?.user.id ?? "none"}|${profile?.userId ?? "none"}|${profile?.role ?? "none"}`,
  );
}

describe("AppProviders session sync", () => {
  const mockedGetCurrentProfile = jest.mocked(getCurrentProfile);
  const mockedGetSupabaseBrowserClient = jest.mocked(getSupabaseBrowserClient);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("records a PASSWORD_RECOVERY event as proof of a recovery session", async () => {
    clearRecovery();
    const supabase = createSupabaseStub(null);

    mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
    mockedGetCurrentProfile.mockResolvedValue(null as never);

    await render(React.createElement(AppProviders, null, React.createElement(SessionProbe)));

    await act(async () => {
      supabase.emit(createSession("user-1"), "PASSWORD_RECOVERY");
    });

    expect(hasRecovery()).toBe(true);
  });

  it("keeps the navigator mounted when the tab regains focus and SIGNED_IN repeats for the same user", async () => {
    const supabase = createSupabaseStub(createSession("user-1"));

    mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
    mockedGetCurrentProfile.mockResolvedValue({ role: "customer", userId: "user-1" } as never);

    const view = await render(React.createElement(AppProviders, null, React.createElement(SessionProbe)));

    await waitFor(() => {
      expect(view.getByText("idle|user-1|user-1|customer")).toBeTruthy();
    });

    await act(async () => {
      supabase.emit(createSession("user-1"), "SIGNED_IN");
    });

    expect(view.getByText("idle|user-1|user-1|customer")).toBeTruthy();
    expect(mockedGetCurrentProfile).toHaveBeenCalledTimes(1);
  });

  it("clears stale profile state and ignores an older async profile read", async () => {
    const firstProfile = createDeferred<ProfileSnapshot | null>();
    const secondProfile = createDeferred<ProfileSnapshot | null>();
    const supabase = createSupabaseStub(createSession("user-1"));

    mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
    mockedGetCurrentProfile
      .mockImplementationOnce(() => firstProfile.promise as never)
      .mockImplementationOnce(() => secondProfile.promise as never);

    const view = await render(
      React.createElement(
        AppProviders,
        null,
        React.createElement(SessionProbe),
      ),
    );

    await waitFor(() => {
      expect(view.getByText("loading|user-1|none|none")).toBeTruthy();
    });

    await act(async () => {
      supabase.emit(createSession("user-2"));
    });

    await waitFor(() => {
      expect(view.getByText("loading|user-2|none|none")).toBeTruthy();
    });

    await act(async () => {
      secondProfile.resolve({ role: "customer", userId: "user-2" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getByText("idle|user-2|user-2|customer")).toBeTruthy();
    });

    await act(async () => {
      firstProfile.resolve({ role: "owner", userId: "user-1" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getByText("idle|user-2|user-2|customer")).toBeTruthy();
    });
  });

  it.each(["USER_UPDATED", "TOKEN_REFRESHED"])(
    "%s keeps the settled app as it is instead of reloading the profile behind a spinner",
    async (event) => {
      const supabase = createSupabaseStub(createSession("user-1"));

      mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
      mockedGetCurrentProfile.mockResolvedValue({ role: "customer", userId: "user-1" } as never);

      const view = await render(
        React.createElement(AppProviders, null, React.createElement(SessionProbe)),
      );

      await waitFor(() => {
        expect(view.getByText("idle|user-1|user-1|customer")).toBeTruthy();
      });

      await act(async () => {
        supabase.emit(createSession("user-1"), event);
      });

      expect(view.getByText("idle|user-1|user-1|customer")).toBeTruthy();
      expect(mockedGetCurrentProfile).toHaveBeenCalledTimes(1);
    },
  );

  describe("query cache across users", () => {
    let cache: QueryClient;

    function CacheProbe() {
      cache = useQueryClient();

      return null;
    }

    async function renderSettled(userId: string) {
      const supabase = createSupabaseStub(createSession(userId));

      mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
      mockedGetCurrentProfile.mockResolvedValue({ role: "customer", userId } as never);

      const view = await render(
        React.createElement(
          AppProviders,
          null,
          React.createElement(SessionProbe),
          React.createElement(CacheProbe),
        ),
      );

      await waitFor(() => {
        expect(view.getByText(`idle|${userId}|${userId}|customer`)).toBeTruthy();
      });

      cache.setQueryData(["my-profile"], { name: "previous user" });

      return supabase;
    }

    it("drops the cached data on SIGNED_OUT so the next login cannot see it", async () => {
      const supabase = await renderSettled("user-1");

      await act(async () => {
        supabase.emit(null, "SIGNED_OUT");
      });

      expect(cache.getQueryData(["my-profile"])).toBeUndefined();
    });

    it("drops the cached data when a different user signs in without a SIGNED_OUT", async () => {
      const supabase = await renderSettled("user-1");

      await act(async () => {
        supabase.emit(createSession("user-2"), "SIGNED_IN");
      });

      expect(cache.getQueryData(["my-profile"])).toBeUndefined();
    });

    it.each(["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"])(
      "keeps the cached data when %s repeats for the same user",
      async (event) => {
        const supabase = await renderSettled("user-1");

        await act(async () => {
          supabase.emit(createSession("user-1"), event);
        });

        expect(cache.getQueryData(["my-profile"])).toEqual({ name: "previous user" });
      },
    );
  });

  it("falls back to a cleared profile when the profile RPC fails", async () => {
    const supabase = createSupabaseStub(createSession("user-1"));

    mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
    mockedGetCurrentProfile.mockRejectedValueOnce(new Error("profile RPC failed"));

    const view = await render(
      React.createElement(
        AppProviders,
        null,
        React.createElement(SessionProbe),
      ),
    );

    await waitFor(() => {
      expect(view.getByText("idle|user-1|none|none")).toBeTruthy();
    });
  });

  it("ignores a cleaned-up getSession callback during StrictMode effect replay", async () => {
    const firstSession = createDeferred<{ data: { session: Session | null } }>();
    const secondSession = createDeferred<{ data: { session: Session | null } }>();
    const profile = createDeferred<ProfileSnapshot | null>();
    const supabase = createSupabaseStub(null);

    supabase.client.auth.getSession = jest
      .fn()
      .mockImplementationOnce(() => firstSession.promise)
      .mockImplementationOnce(() => secondSession.promise);

    mockedGetSupabaseBrowserClient.mockReturnValue(supabase.client as never);
    mockedGetCurrentProfile.mockImplementationOnce(() => profile.promise as never);

    const view = await render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          AppProviders,
          null,
          React.createElement(SessionProbe),
        ),
      ),
    );

    await waitFor(() => {
      expect(supabase.client.auth.getSession).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      secondSession.resolve({ data: { session: createSession("user-2") } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getByText("loading|user-2|none|none")).toBeTruthy();
    });

    await act(async () => {
      profile.resolve({ role: "customer", userId: "user-2" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getByText("idle|user-2|user-2|customer")).toBeTruthy();
    });

    await act(async () => {
      firstSession.resolve({ data: { session: createSession("user-1") } });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(view.getByText("idle|user-2|user-2|customer")).toBeTruthy();
    });
  });
});
