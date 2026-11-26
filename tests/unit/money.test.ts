import { centsToReaisInput, formatMoneyInput, parseReaisToCents } from "../../src/lib/money";

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

describe("formatMoneyInput (cents-first BRL mask)", () => {
  it("fills from the cents as digits are typed", () => {
    expect(formatMoneyInput("")).toBe("");
    expect(formatMoneyInput("5")).toBe("R$ 0,05");
    expect(formatMoneyInput("45")).toBe("R$ 0,45");
    expect(formatMoneyInput("450")).toBe("R$ 4,50");
    expect(formatMoneyInput("4500")).toBe("R$ 45,00");
    expect(formatMoneyInput("123456")).toBe("R$ 1.234,56");
    expect(formatMoneyInput("123456789")).toBe("R$ 1.234.567,89");
  });

  it("backspace removes the last digit", () => {
    expect(formatMoneyInput("R$ 1.234,5")).toBe("R$ 123,45");
    expect(formatMoneyInput("R$ 0,0")).toBe("");
  });

  it("is empty for nothing or zero, never R$ 0,00", () => {
    expect(formatMoneyInput("0")).toBe("");
    expect(formatMoneyInput("000")).toBe("");
    expect(formatMoneyInput("R$ 0,00")).toBe("");
    expect(formatMoneyInput("abc")).toBe("");
  });

  it("re-formats a value that is already formatted (opening an existing value, pasting)", () => {
    expect(formatMoneyInput("45,00")).toBe("R$ 45,00");
    expect(formatMoneyInput("R$ 75,90")).toBe("R$ 75,90");
    expect(formatMoneyInput("1.250,00")).toBe("R$ 1.250,00");
    expect(formatMoneyInput(centsToReaisInput(123456))).toBe("R$ 1.234,56");
  });

  it("caps very large numbers at 9 digits (R$ 9.999.999,99)", () => {
    expect(formatMoneyInput("99999999999999")).toBe("R$ 9.999.999,99");
  });

  it("what it shows is what parseReaisToCents stores", () => {
    expect(parseReaisToCents(formatMoneyInput("4500"))).toBe(4500);
    expect(parseReaisToCents(formatMoneyInput("123456"))).toBe(123456);
    expect(parseReaisToCents(formatMoneyInput("5"))).toBe(5);
    expect(parseReaisToCents(formatMoneyInput(""))).toBeNull();
  });
});
