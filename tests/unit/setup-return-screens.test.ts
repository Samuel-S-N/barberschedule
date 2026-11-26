import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(__dirname, "..", "..", file), "utf8");

// Every screen the checklist opens returns to /setup when its own save succeeds (explicit `from=setup`, never guessed from history).
describe("screens opened from the setup checklist", () => {
  it.each([
    ["app/(owner)/shop.tsx", "returnToSetup()"],
    ["app/(owner)/service-form.tsx", "returnToSetup()"],
    ["app/(owner)/professional-new.tsx", "returnToSetup()"],
    ["app/(owner)/professional-profile.tsx", "returnToSetup()"],
    ["app/(owner)/appearance.tsx", "returnToSetup()"],
  ])("%s returns to the checklist after saving", (file, call) => {
    const source = read(file);

    expect(source).toContain("useFromSetup");
    expect(source).toContain(call);
  });

  it("the services list carries from=setup on to the service form", () => {
    expect(read("app/(owner)/services.tsx")).toContain("carry(");
  });

  it("the checklist opens every step with from=setup", () => {
    expect(read("app/(owner)/setup.tsx")).toContain("FROM_SETUP");
    expect(read("src/features/setup/SetupTeamStep.tsx")).toContain("FROM_SETUP");
  });
});
