import { pendingKinds, requiredKinds, signupConsents } from "../../src/features/legal/pending";

const versions = { business: "2026-11-26", privacy: "2026-11-26", terms: "2026-11-26" };

describe("requiredKinds", () => {
  it("customers and professionals accept terms and privacy", () => {
    expect(requiredKinds("customer", { setupComplete: true })).toEqual(["terms", "privacy"]);
    expect(requiredKinds("professional", { setupComplete: false })).toEqual(["terms", "privacy"]);
  });

  it("owners add the business agreement only after the setup is complete", () => {
    expect(requiredKinds("owner", { setupComplete: false })).toEqual(["terms", "privacy"]);
    expect(requiredKinds("owner", { setupComplete: true })).toEqual(["terms", "privacy", "business"]);
  });

  it("no role, nothing to accept", () => {
    expect(requiredKinds(null, { setupComplete: true })).toEqual([]);
  });
});

describe("pendingKinds", () => {
  it("is empty when the latest consent of every required kind is current", () => {
    const consents = [{ kind: "terms", version: "2026-11-26" }, { kind: "privacy", version: "2026-11-26" }] as const;

    expect(pendingKinds(["terms", "privacy"], [...consents], versions)).toEqual([]);
  });

  it("lists a kind whose last consent is older than the current version", () => {
    expect(pendingKinds(["terms", "privacy"], [{ kind: "terms", version: "2026-11-26" }, { kind: "privacy", version: "2026-09-23" }], versions)).toEqual(["privacy"]);
  });

  it("lists a kind with no consent at all (invited owner or professional)", () => {
    expect(pendingKinds(["terms", "privacy"], [], versions)).toEqual(["terms", "privacy"]);
  });

  it("a consent newer than the current version still counts", () => {
    expect(pendingKinds(["terms"], [{ kind: "terms", version: "2027-01-01" }], versions)).toEqual([]);
  });
});

describe("signupConsents", () => {
  it("reads the versions accepted at signup from the user metadata", () => {
    expect(signupConsents({ accepted_privacy_version: "2026-11-26", accepted_terms_version: "2026-11-20" })).toEqual([
      { kind: "terms", version: "2026-11-20" },
      { kind: "privacy", version: "2026-11-26" },
    ]);
  });

  it("falls back to the terms version for privacy, like ensure_my_customer", () => {
    expect(signupConsents({ accepted_terms_version: "2026-11-26" })).toEqual([
      { kind: "terms", version: "2026-11-26" },
      { kind: "privacy", version: "2026-11-26" },
    ]);
  });

  it("is empty without metadata or with blank values", () => {
    expect(signupConsents(undefined)).toEqual([]);
    expect(signupConsents({ accepted_terms_version: "  " })).toEqual([]);
  });
});
