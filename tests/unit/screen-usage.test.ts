import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const appDir = join(__dirname, "..", "..", "app");

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

describe("safe area handling", () => {
  it("no route uses React Native's SafeAreaView (deprecated, does nothing on Android)", () => {
    const offenders = listFiles(appDir)
      .filter((file) => file.endsWith(".tsx") && /SafeAreaView/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(appDir, "app"));

    expect(offenders).toEqual([]);
  });

  it("declares react-native-safe-area-context as a direct dependency", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));

    expect(pkg.dependencies).toHaveProperty("react-native-safe-area-context");
  });
});
