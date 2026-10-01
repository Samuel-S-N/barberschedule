import { readFileSync } from "fs";
import { join } from "path";

const read = (file: string) => readFileSync(join(__dirname, "..", "..", file), "utf8");

describe("owner shop screen", () => {
  const screen = read("app/(owner)/shop.tsx");

  it("edits contact info, weekly hours and breaks and saves both", () => {
    for (const needle of ["draftToPeriods", "saveShopHours", "updateShopContact", 't("owner.shop.addBreak")', 't("owner.shop.save")']) {
      expect(screen).toContain(needle);
    }
  });

  it("is reachable from settings", () => {
    expect(read("app/(owner)/settings.tsx")).toContain('"/shop"');
  });
});
