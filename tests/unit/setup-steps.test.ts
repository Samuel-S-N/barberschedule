import { canOpen, professionalLacks, progress, REQUIRED_STEPS, stepDone } from "../../src/features/setup/steps";
import type { SetupStatus } from "../../src/features/setup/api";

const none: SetupStatus = { completed: false, missing: ["agreement", "details", "hours", "services", "team"], professionals: [] };

describe("setup steps", () => {
  it("lists the five required steps in checklist order", () => {
    expect(REQUIRED_STEPS).toEqual(["agreement", "details", "hours", "services", "team"]);
  });

  it("a step is done when the server does not list it as missing", () => {
    const status = { ...none, missing: ["hours", "team"] } as SetupStatus;

    expect(stepDone(status, "agreement")).toBe(true);
    expect(stepDone(status, "hours")).toBe(false);
  });

  it("counts progress out of five and opens only when nothing is missing", () => {
    expect(progress(none)).toEqual({ done: 0, total: 5 });
    expect(progress({ ...none, missing: ["team"] })).toEqual({ done: 4, total: 5 });
    expect(canOpen(none)).toBe(false);
    expect(canOpen({ ...none, missing: [] })).toBe(true);
  });

  it("says what a professional lacks", () => {
    expect(professionalLacks({ hasHours: false, hasServices: false, id: "p", name: "A" })).toEqual(["hours", "services"]);
    expect(professionalLacks({ hasHours: true, hasServices: false, id: "p", name: "A" })).toEqual(["services"]);
    expect(professionalLacks({ hasHours: true, hasServices: true, id: "p", name: "A" })).toEqual([]);
  });
});
