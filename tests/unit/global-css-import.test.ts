import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("NativeWind stylesheet", () => {
  it("is imported by the root layout so className styles reach the app", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app", "_layout.tsx"), "utf8");

    expect(layout).toMatch(/import\s+["']\.\.\/global\.css["'];/);
  });
});
