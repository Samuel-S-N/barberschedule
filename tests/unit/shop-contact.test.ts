import { telUrl, whatsappUrl } from "../../src/features/shops/contact";

describe("contact links", () => {
  it("builds a tel: link keeping a leading +", () => {
    expect(telUrl("(11) 3000-0000")).toBe("tel:1130000000");
    expect(telUrl("+55 11 3000-0000")).toBe("tel:+551130000000");
    expect(telUrl("  ")).toBeNull();
  });

  it("builds a wa.me link, adding Brazil's 55 to national numbers", () => {
    expect(whatsappUrl("(11) 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(whatsappUrl("+55 11 99999-0000")).toBe("https://wa.me/5511999990000");
    expect(whatsappUrl("")).toBeNull();
  });
});
