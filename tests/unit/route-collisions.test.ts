import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const appDir = join(__dirname, "..", "..", "app");
// "/" is served by app/index.tsx and (owner)/index.tsx; this predates the customer frontend.
const ALLOWED_DUPLICATES = new Set(["/"]);

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listRouteFiles(path) : [path];
  });
}

export function findRouteCollisions(files: string[]) {
  const owners = new Map<string, string[]>();

  for (const file of files) {
    if (!file.endsWith(".tsx") || file.split("/").pop()!.startsWith("_layout")) continue;

    const url = "/" + file
      .replace(/\.tsx$/, "")
      .split("/")
      .filter((segment) => !/^\(.*\)$/.test(segment))
      .join("/")
      .replace(/(^|\/)index$/, "");
    owners.set(url, [...(owners.get(url) ?? []), file]);
  }

  return [...owners].filter(([, paths]) => paths.length > 1).map(([url, paths]) => ({ paths, url }));
}

describe("route collisions", () => {
  it("detects two files in different groups resolving to the same URL", () => {
    expect(findRouteCollisions(["(owner)/agenda.tsx", "(customer)/agenda.tsx", "(customer)/home.tsx"])).toEqual([
      { paths: ["(owner)/agenda.tsx", "(customer)/agenda.tsx"], url: "/agenda" },
    ]);
  });

  it("ignores layouts", () => {
    expect(findRouteCollisions(["(owner)/_layout.tsx", "(customer)/_layout.tsx"])).toEqual([]);
  });

  it("has no unexpected duplicate URLs under app/", () => {
    const files = listRouteFiles(appDir).map((path) => relative(appDir, path));
    const unexpected = findRouteCollisions(files).filter(({ url }) => !ALLOWED_DUPLICATES.has(url));

    expect(unexpected).toEqual([]);
  });
});
