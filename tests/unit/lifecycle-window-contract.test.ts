import { readFileSync } from "node:fs";
import { join } from "node:path";

import { LIFECYCLE_LOCK_MINUTES } from "../../src/features/appointments/validation";

describe("lifecycle lock window", () => {
  it("matches the interval enforced by the database", () => {
    const sql = readFileSync(join(__dirname, "../../supabase/migrations/0014_appointment_lifecycle.sql"), "utf8");
    const minutes = [...sql.matchAll(/interval '(\d+) minutes'/g)].map((match) => Number(match[1]));

    expect(minutes.length).toBeGreaterThan(0);
    expect(minutes.every((value) => value === LIFECYCLE_LOCK_MINUTES)).toBe(true);
  });
});
