import { formatPhone, phoneDigits } from "../../src/features/account/phone";

describe("phoneDigits", () => {
  it("keeps digits only", () => {
    expect(phoneDigits("(11) 91234-5678")).toBe("11912345678");
    expect(phoneDigits("(11)91234-5678")).toBe("11912345678");
    expect(phoneDigits("abc")).toBe("");
    expect(phoneDigits("")).toBe("");
  });

  it("drops a pasted +55 country code", () => {
    expect(phoneDigits("+55 11 90000-0000")).toBe("11900000000");
    expect(phoneDigits("5511900000000")).toBe("11900000000");
  });

  it("is at most 11 digits", () => {
    expect(phoneDigits("119123456789999")).toBe("11912345678");
  });

  it("keeps a 10-digit landline as it is", () => {
    expect(phoneDigits("1112345678")).toBe("1112345678");
  });
});

describe("formatPhone", () => {
  it("formats 11 digits as (00) 00000-0000 and 10 digits as (00) 0000-0000", () => {
    expect(formatPhone("11912345678")).toBe("(11) 91234-5678");
    expect(formatPhone("1112345678")).toBe("(11) 1234-5678");
  });

  it("formats partial input progressively", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("1")).toBe("(1");
    expect(formatPhone("11")).toBe("(11");
    expect(formatPhone("119")).toBe("(11) 9");
    expect(formatPhone("119123")).toBe("(11) 9123");
    expect(formatPhone("1191234")).toBe("(11) 9123-4");
    expect(formatPhone("1191234567")).toBe("(11) 9123-4567");
  });

  it("accepts already formatted input (old stored values, pasted text) and re-formats it", () => {
    expect(formatPhone("(11)91234-5678")).toBe("(11) 91234-5678");
    expect(formatPhone("(11) 91234-5678")).toBe("(11) 91234-5678");
    expect(formatPhone("11 91234 5678")).toBe("(11) 91234-5678");
    expect(formatPhone("+55 11 90000-0000")).toBe("(11) 90000-0000");
  });

  it("ignores letters and everything past 11 digits", () => {
    expect(formatPhone("abc")).toBe("");
    expect(formatPhone("1a1b9")).toBe("(11) 9");
    expect(formatPhone("119123456789999")).toBe("(11) 91234-5678");
  });
});
