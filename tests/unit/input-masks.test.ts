import { formatDateInput, formatPercentInput, formatTimeInput, nextPercentState, parseDateInput, percentDisplay } from "../../src/lib/input-masks";

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

describe("percent input", () => {
  it("accepts digits and one decimal separator (comma or dot), at most 2 decimals", () => {
    expect(formatPercentInput("")).toBe("");
    expect(formatPercentInput("40")).toBe("40");
    expect(formatPercentInput("40,5")).toBe("40.5");
    expect(formatPercentInput("40.55")).toBe("40.55");
    expect(formatPercentInput("40,555")).toBe("40.55");
    expect(formatPercentInput("4,0,5")).toBe("4.05");
    expect(formatPercentInput("40,")).toBe("40.");
    expect(formatPercentInput(",5")).toBe("0.5");
  });

  it("drops everything else, including a pasted % and spaces", () => {
    expect(formatPercentInput("40%")).toBe("40");
    expect(formatPercentInput("abc")).toBe("");
    expect(formatPercentInput(" 4 0 ")).toBe("40");
  });

  it("clamps at 100", () => {
    expect(formatPercentInput("100")).toBe("100");
    expect(formatPercentInput("101")).toBe("100");
    expect(formatPercentInput("1000")).toBe("100");
    expect(formatPercentInput("100,5")).toBe("100");
    expect(formatPercentInput("99,99")).toBe("99.99");
  });

  it("drops leading zeros", () => {
    expect(formatPercentInput("007")).toBe("7");
    expect(formatPercentInput("0,5")).toBe("0.5");
  });

  it("shows a % suffix and a decimal comma, nothing when empty", () => {
    expect(percentDisplay("")).toBe("");
    expect(percentDisplay("40")).toBe("40%");
    expect(percentDisplay("40.5")).toBe("40,5%");
    expect(percentDisplay("40.")).toBe("40,%");
  });

  it("backspace on the % suffix removes the last digit instead of being undone", () => {
    expect(nextPercentState("40", "40")).toBe("4");
    expect(nextPercentState("40.5", "40,5")).toBe("40.");
    expect(nextPercentState("40.", "40,")).toBe("40");
    expect(nextPercentState("4", "4")).toBe("");
  });

  it("typing appends before the suffix", () => {
    expect(nextPercentState("4", "4%0")).toBe("40");
    expect(nextPercentState("", "5")).toBe("5");
  });
});
