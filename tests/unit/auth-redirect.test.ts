import { resolveAuthRedirect } from "../../src/features/auth/session";

const sessionStub = { user: { id: "u1" } } as never;

it.each(["privacidade", "termos", "contrato"])("lets a signed-out visitor read /%s", (segment) => {
  expect(resolveAuthRedirect({ profileRole: null, segments: [segment], session: null })).toBeNull();
});

describe("pending legal documents", () => {
  it("sends a signed-in user with pending documents to /accept-terms", () => {
    expect(resolveAuthRedirect({ pendingLegal: true, profileRole: "customer", segments: ["(customer)", "(tabs)", "home"], session: sessionStub })).toBe("/accept-terms");
  });

  it("leaves /accept-terms, the legal documents and sign-out alone", () => {
    for (const segments of [["accept-terms"], ["privacidade"], ["termos"], ["contrato"]]) {
      expect(resolveAuthRedirect({ pendingLegal: true, profileRole: "customer", segments, session: sessionStub })).toBeNull();
    }
  });

  it("sends a user with nothing pending away from /accept-terms", () => {
    expect(resolveAuthRedirect({ pendingLegal: false, profileRole: "customer", segments: ["accept-terms"], session: sessionStub })).toBe("/");
  });

  it("does not interfere while signed out", () => {
    expect(resolveAuthRedirect({ pendingLegal: true, profileRole: null, segments: ["(auth)", "login"], session: null })).toBeNull();
  });
});

describe("owner setup pending", () => {
  const owner = { profileRole: "owner", session: sessionStub } as const;

  it.each(["agenda", "revenue", "manage", "settings"])("sends the owner from the %s tab to /setup", (tab) => {
    expect(resolveAuthRedirect({ ...owner, ownerSetupPending: true, segments: ["(owner)", tab] })).toBe("/setup");
  });

  it.each(["shop", "services", "professionals", "professional-new", "professional-profile", "schedule", "appearance", "setup", "shop-link"])("lets the owner open /%s while pending", (screen) => {
    expect(resolveAuthRedirect({ ...owner, ownerSetupPending: true, segments: ["(owner)", screen] })).toBeNull();
  });

  it("sends an owner with nothing pending away from /setup", () => {
    expect(resolveAuthRedirect({ ...owner, ownerSetupPending: false, segments: ["(owner)", "setup"] })).toBe("/agenda");
  });

  it("never affects other roles", () => {
    expect(resolveAuthRedirect({ ownerSetupPending: true, profileRole: "customer", segments: ["(customer)", "(tabs)", "home"], session: sessionStub })).toBeNull();
  });
});
