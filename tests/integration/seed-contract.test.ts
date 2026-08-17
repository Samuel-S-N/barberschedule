import { readFileSync } from "node:fs";

describe("development seed contract", () => {
  const seed = readFileSync("supabase/seed.sql", "utf8");

  it("uses fixed fictional fixtures and no production credentials", () => {
    expect(seed).toContain("seed-owner@example.test");
    expect(seed).toContain("+55 11 90000-0001");
    expect(seed).toContain("SLOT_UNAVAILABLE");
    expect(seed).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|sk_live|pk_live/i);
  });

  it("keeps the seed repeatable and representative", () => {
    expect(seed.match(/on conflict/gi)?.length).toBeGreaterThanOrEqual(8);
    expect(seed).toContain("false");
    expect(seed).toContain("recurrence_conflicts");
    expect(seed).toContain("2030-01-08");
  });
});
