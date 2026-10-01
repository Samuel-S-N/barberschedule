import { daysSince, LAPSED_DAYS, telUrl, whatsappUrl } from "../../src/features/clients/format";

describe("client contact links", () => {
  it("adds the Brazilian country code when it is missing", () => {
    expect(whatsappUrl("(11) 98888-7777")).toBe("https://wa.me/5511988887777");
    expect(whatsappUrl("1133334444")).toBe("https://wa.me/551133334444");
  });

  it("keeps a number that already has the country code", () => {
    expect(whatsappUrl("+55 11 98888-7777")).toBe("https://wa.me/5511988887777");
  });

  it("returns null when there is no usable number", () => {
    expect(whatsappUrl(null)).toBeNull();
    expect(whatsappUrl("123")).toBeNull();
    expect(telUrl("")).toBeNull();
  });

  it("builds a tel link with the country code", () => {
    expect(telUrl("11 98888-7777")).toBe("tel:+5511988887777");
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince("2026-09-20T15:00:00.000Z", new Date("2026-10-01T10:00:00.000Z"))).toBe(10);
    expect(daysSince("2026-10-01T09:00:00.000Z", new Date("2026-10-01T10:00:00.000Z"))).toBe(0);
  });

  it("exposes the lapsed threshold", () => {
    expect(LAPSED_DAYS).toBe(45);
  });
});
