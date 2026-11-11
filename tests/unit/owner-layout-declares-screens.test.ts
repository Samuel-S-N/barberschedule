import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Since Expo SDK 58 a route the tab navigator does not know is not navigable: it redirects to the first tab.
// Every file under app/(owner) must therefore be declared in the layout (as a tab or in one of its screen lists).
describe("owner layout", () => {
  const dir = join(__dirname, "..", "..", "app", "(owner)");
  const layout = readFileSync(join(dir, "_layout.tsx"), "utf8");
  const screens = readdirSync(dir)
    .filter((file) => file.endsWith(".tsx") && !file.startsWith("_"))
    .map((file) => file.replace(/\.tsx$/, ""));

  it("declares every owner screen", () => {
    const undeclared = screens.filter((name) => !layout.includes(`"${name}"`));

    expect(undeclared).toEqual([]);
  });
});
