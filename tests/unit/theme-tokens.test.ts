import { readFileSync } from "node:fs";
import { join } from "node:path";

import tailwindConfig from "../../tailwind.config";
import { DEFAULT_THEME } from "../../src/lib/design/theme/derive";

describe("theme tokens", () => {
  const css = readFileSync(join(__dirname, "../../global.css"), "utf8");
  const declared = Object.fromEntries([...css.matchAll(/(--c-[a-z0-9-]+):\s*([\d ]+);/g)].map((match) => [match[1], match[2].trim()]));

  it("declares the default Zenc palette in global.css exactly as the defaults", () => {
    expect(declared).toEqual(DEFAULT_THEME.vars);
  });

  it("only references variables that global.css declares", () => {
    const colors = JSON.stringify(tailwindConfig.theme?.extend?.colors);
    const used = new Set([...colors.matchAll(/var\((--c-[a-z0-9-]+)\)/g)].map((match) => match[1]));

    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(declared).toHaveProperty(name);
    for (const name of Object.keys(declared)) expect(used).toContain(name);
  });

  it("keeps status colours as fixed hex and removes the unused wine token", () => {
    const colors = tailwindConfig.theme?.extend?.colors as Record<string, unknown>;

    expect(colors.danger).toEqual({ 50: "#FDF1F0", 500: "#DC3B30", 600: "#B92C22" });
    expect(colors).not.toHaveProperty("wine");
    expect(colors).not.toHaveProperty("ink-soft");
  });
});
