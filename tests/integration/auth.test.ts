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
        segments: ["(public)", "book"],
        session: createSession(),
      }),
    ).toBe("/");
  });

  it("keeps customers on customer booking routes", () => {
    expect(
      getRedirect({
        role: "customer",
        segments: ["(public)", "book"],
        session: createSession(),
      }),
    ).toBeNull();
  });
});
