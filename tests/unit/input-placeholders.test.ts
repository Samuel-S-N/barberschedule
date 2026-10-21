import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? tsxFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("every text field shows a ghost example", () => {
  it("<Input> and <SearchInput> have a placeholder (password fields are exempt)", () => {
    const offenders: string[] = [];

    for (const file of [...tsxFiles(join(root, "app")), ...tsxFiles(join(root, "src"))]) {
      if (file.endsWith("components/ui/Input.tsx") || file.endsWith("components/ui/SearchInput.tsx")) continue;
      const source = readFileSync(file, "utf8");

      for (const tag of source.match(/<(?:Input|SearchInput)\b[\s\S]*?\/>/g) ?? []) {
        if (!tag.includes("placeholder=") && !tag.includes("secureTextEntry")) offenders.push(`${relative(root, file)}: ${tag.slice(0, 90).replace(/\s+/g, " ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
