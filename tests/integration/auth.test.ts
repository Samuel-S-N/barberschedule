import type { Session } from "@supabase/supabase-js";

import { resolveAuthRedirect } from "../../src/features/auth/session";
import type { AppRole } from "../../src/features/auth/types";

function createSession(userId = "11111111-1111-1111-1111-111111111111") {
  return {
    access_token: "token",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: userId },
  } as Session;
}

function getRedirect(
  options: {
  segments?: string[];
  role?: AppRole | null;
  session?: Session | null;
} = {},
) {
  return resolveAuthRedirect({
    profileRole: options.role ?? null,
    segments: options.segments ?? [],
    session: options.session ?? null,
  });
}

describe("auth session routing", () => {
  it("redirects anonymous visitors away from protected routes", () => {
    expect(getRedirect()).toBe("/login");
  });

  it("keeps anonymous visitors on auth routes", () => {
    expect(getRedirect({ segments: ["(auth)", "login"] })).toBeNull();
  });

  it("redirects authenticated users away from auth routes", () => {
    expect(
      getRedirect({
        role: "owner",
        segments: ["(auth)", "login"],
        session: createSession(),
      }),
    ).toBe("/");
  });

  it("redirects customers away from owner-only routes", () => {
    expect(
      getRedirect({
        role: "customer",
        segments: ["(owner)", "barbers"],
        session: createSession(),
      }),
    ).toBe("/");
  });

  it("redirects owners away from customer booking routes", () => {
    expect(
      getRedirect({
        role: "owner",
        segments: ["(customer)", "book"],
        session: createSession(),
      }),
    ).toBe("/");
  });

  it("keeps customers on customer booking routes", () => {
    expect(
      getRedirect({
        role: "customer",
        segments: ["(customer)", "book"],
        session: createSession(),
      }),
    ).toBeNull();
  });

  it("lets anyone open the legal page, signed in or out", () => {
    expect(getRedirect({ segments: ["legal"] })).toBeNull();
    expect(getRedirect({ role: "customer", segments: ["legal"], session: createSession() })).toBeNull();
  });

  it("redirects a signed-in user whose profile role is unknown away from role groups", () => {
    expect(getRedirect({ role: null, segments: ["(customer)", "home"], session: createSession() })).toBe("/");
  });
});
