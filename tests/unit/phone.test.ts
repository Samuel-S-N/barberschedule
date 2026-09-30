import { formatPhone } from "../../src/features/account/phone";

describe("formatPhone", () => {
  it("formats 11 digits as (DD)NNNNN-NNNN and 10 digits as (DD)NNNN-NNNN", () => {
    expect(formatPhone("11912345678")).toBe("(11)91234-5678");
    expect(formatPhone("1112345678")).toBe("(11)1234-5678");
  });

  it("accepts input that is already formatted or has other separators", () => {
    expect(formatPhone("(11)91234-5678")).toBe("(11)91234-5678");
    expect(formatPhone("(11) 91234-5678")).toBe("(11)91234-5678");
    expect(formatPhone("11 91234 5678")).toBe("(11)91234-5678");
  });

  it("drops a leading Brazilian country code", () => {
    expect(formatPhone("+55 11 90000-0000")).toBe("(11)90000-0000");
    expect(formatPhone("5511900000000")).toBe("(11)90000-0000");
  });

  it("follows the typing progressively", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("1")).toBe("(1");
    expect(formatPhone("11")).toBe("(11");
    expect(formatPhone("119")).toBe("(11)9");
    expect(formatPhone("119123")).toBe("(11)9123");
    expect(formatPhone("1191234")).toBe("(11)9123-4");
    expect(formatPhone("1191234567")).toBe("(11)9123-4567");
  });

  it("ignores letters and digits beyond 11", () => {
    expect(formatPhone("abc")).toBe("");
    expect(formatPhone("119123456789999")).toBe("(11)91234-5678");
  });
});
