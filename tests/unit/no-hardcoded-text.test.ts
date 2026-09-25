import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(__dirname, "..", "..");
const TEXT_PROPS = "label|placeholder|title|message|accessibilityLabel";

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function findHardcodedText(source: string) {
  const found: string[] = [];
  const propLiteral = new RegExp(`\\b(?:${TEXT_PROPS})="([^"{}]*[A-Za-z][^"{}]*)"`, "g");
  // JSX text: `>` then natural-language characters (no code punctuation) then `</`.
  const jsxText = />\s*([A-Za-z][A-Za-z0-9 ,.'’!?:()/&-]*?)\s*<\//g;

  for (const match of source.matchAll(propLiteral)) found.push(match[1]);
  for (const match of source.matchAll(jsxText)) found.push(match[1].trim());

  return found;
}

describe("hard-coded text guard", () => {
  it("flags literal text in JSX and text props", () => {
    expect(findHardcodedText('<Button label="Save" />')).toEqual(["Save"]);
    expect(findHardcodedText("<Text>Book now</Text>")).toEqual(["Book now"]);
    expect(findHardcodedText('<Text>{t("a.b")}</Text>')).toEqual([]);
    expect(findHardcodedText('<Button label={t("a.b")} />')).toEqual([]);
  });

  it("flags text that spans lines inside a tag", () => {
    expect(findHardcodedText("<Text>\n  Choose a date\n</Text>")).toEqual(["Choose a date"]);
  });

  it("finds no untranslated text in routes or components", () => {
    const files = [...listFiles(join(root, "app")), ...listFiles(join(root, "src", "components"))].filter((file) => file.endsWith(".tsx"));
    const offenders = files.flatMap((file) =>
      findHardcodedText(readFileSync(file, "utf8")).map((text) => `${relative(root, file)}: ${text}`),
    );

    expect(offenders).toEqual([]);
  });
});
