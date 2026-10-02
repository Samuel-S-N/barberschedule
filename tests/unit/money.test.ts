import { centsToReaisInput, parseReaisToCents } from "../../src/lib/money";

describe("parseReaisToCents", () => {
  it.each([
    ["300", 30000],
    ["300,50", 30050],
    ["300.5", 30050],
    ["1.250,00", 125000],
    ["R$ 75,90", 7590],
    [" 0,99 ", 99],
  ])("parses %s", (input, cents) => {
    expect(parseReaisToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", "-5", "1,234", "12,5,0"])("rejects %j", (input) => {
    expect(parseReaisToCents(input)).toBeNull();
  });
});

describe("centsToReaisInput", () => {
  it("formats cents as an editable decimal-comma amount without grouping", () => {
    expect(centsToReaisInput(30000)).toBe("300,00");
    expect(centsToReaisInput(125050)).toBe("1250,50");
    expect(centsToReaisInput(5)).toBe("0,05");
  });

  it("round-trips through parseReaisToCents", () => {
    expect(parseReaisToCents(centsToReaisInput(123456))).toBe(123456);
  });
});
