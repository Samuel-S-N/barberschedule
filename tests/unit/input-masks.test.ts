import { formatDateInput, formatTimeInput, parseDateInput } from "../../src/lib/input-masks";

describe("formatDateInput", () => {
  it("masks pt/es as DD/MM/YYYY", () => {
    expect(formatDateInput("02102026", "pt")).toBe("02/10/2026");
    expect(formatDateInput("021", "es")).toBe("02/1");
    expect(formatDateInput("02/10/20269", "pt")).toBe("02/10/2026");
  });
  it("masks en as YYYY-MM-DD", () => {
    expect(formatDateInput("20261002", "en")).toBe("2026-10-02");
    expect(formatDateInput("20261", "en")).toBe("2026-1");
    expect(formatDateInput("", "en")).toBe("");
  });
});

describe("parseDateInput", () => {
  it("returns ISO for complete valid dates", () => {
    expect(parseDateInput("02/10/2026", "pt")).toBe("2026-10-02");
    expect(parseDateInput("2026-10-02", "en")).toBe("2026-10-02");
  });
  it("returns null when incomplete or not a real date", () => {
    expect(parseDateInput("02/10/202", "pt")).toBeNull();
    expect(parseDateInput("31/02/2026", "pt")).toBeNull();
  });
});

describe("formatTimeInput", () => {
  it("masks HH:MM", () => {
    expect(formatTimeInput("1")).toBe("1");
    expect(formatTimeInput("123")).toBe("12:3");
    expect(formatTimeInput("12:30")).toBe("12:30");
    expect(formatTimeInput("123099")).toBe("12:30");
  });
});
