import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(__dirname, "..", "..", path), "utf8");

describe("legal links", () => {
  it("signup links to the policy and the terms, not the old /legal page", () => {
    const signup = read("app/(auth)/signup.tsx");

    expect(signup).toContain('"/privacidade"');
    expect(signup).toContain('"/termos"');
    expect(signup).not.toContain('"/legal"');
  });

  it("the shared Privacy area links to the policy and the terms", () => {
    const privacy = read("src/features/account/PrivacyDataScreen.tsx");

    expect(privacy).toContain("LegalLinks");
    expect(privacy).not.toContain('"/legal"');
  });
});
