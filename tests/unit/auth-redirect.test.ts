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
