import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ROUTE_PARENTS } from "../../src/lib/navigation/parents";

const read = (path: string) => readFileSync(join(__dirname, "..", "..", path), "utf8");

describe("shop link registration", () => {
  it("the owner route is a Manage screen with a Manage parent and a menu item next to Dados e horários", () => {
    expect(read("app/(owner)/_layout.tsx")).toContain('"shop-link"');
    expect(ROUTE_PARENTS["/shop-link"]).toBe("/manage");
    const manage = read("app/(owner)/manage.tsx");

    expect(manage).toContain('key: "shop-link"');
    expect(manage.indexOf('key: "shop"')).toBeLessThan(manage.indexOf('key: "shop-link"'));
  });

  it("the professional route has the profile hub as parent and a hub item", () => {
    expect(ROUTE_PARENTS["/my-profile/shop-link"]).toBe("/my-profile");
    expect(read("app/(professional)/my-profile/index.tsx")).toContain('key: "shop-link"');
  });
});
