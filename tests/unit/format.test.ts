import { formatDateLabel, formatDateNumeric, formatWeekdayShort } from "../../src/lib/i18n/format";

describe("formatWeekdayShort", () => {
  it("follows the language (2026-08-17 is a Monday)", () => {
    expect(formatWeekdayShort("2026-08-17", "en")).toBe("Mon");
    expect(formatWeekdayShort("2026-08-17", "pt")).toMatch(/^seg/i);
    expect(formatWeekdayShort("2026-08-17", "es")).toMatch(/^lun/i);
  });
});

describe("formatDateLabel", () => {
  it("keeps the existing English label", () => {
    expect(formatDateLabel("2026-08-17", "en")).toBe("Mon, 17 Aug");
  });

  it("uses the language's weekday and month names", () => {
    expect(formatDateLabel("2026-08-17", "pt")).toMatch(/^seg.*17.*ago/i);
    expect(formatDateLabel("2026-08-17", "es")).toMatch(/^lun.*17.*ago/i);
  });
});

describe("formatDateNumeric", () => {
  it("follows each language's numeric order (2026-10-02)", () => {
    expect(formatDateNumeric("2026-10-02", "pt")).toBe("02/10/2026");
    expect(formatDateNumeric("2026-10-02", "es")).toBe("02/10/2026");
    expect(formatDateNumeric("2026-10-02", "en")).toBe("10/02/2026");
  });
});
