import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { HISTORY_ROUTES, parentOf, ROOT_ROUTES, ROUTE_PARENTS, routePattern } from "../../src/lib/navigation/parents";

const appDir = join(__dirname, "..", "..", "app");

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? routeFiles(path) : [path];
  });
}

const patterns = routeFiles(appDir)
  .map((path) => relative(appDir, path))
  .filter((file) => file.endsWith(".tsx") && !file.split("/").pop()!.startsWith("_layout"))
  .map((file) => routePattern(file.replace(/\.tsx$/, "").split("/")));

const known = new Set([...patterns, ...ROOT_ROUTES]);
const sample = { barberId: "b1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };

describe("fixed-parent navigation covers every screen", () => {
  it("every route file is a root, a history exception or has a parent", () => {
    const missing = patterns.filter((pattern) => !ROOT_ROUTES.has(pattern) && !HISTORY_ROUTES.has(pattern) && !(pattern in ROUTE_PARENTS));

    expect(missing).toEqual([]);
  });

  it("every parent is a real route", () => {
    const broken = Object.keys(ROUTE_PARENTS).flatMap((pattern) => {
      const parent = parentOf(pattern, sample);

      return parent !== null && !known.has(parent.split("?")[0]) ? [`${pattern} -> ${parent}`] : [];
    });

    expect(broken).toEqual([]);
  });

  it("the map has no stale entries for deleted screens", () => {
    expect(Object.keys(ROUTE_PARENTS).filter((pattern) => !patterns.includes(pattern))).toEqual([]);
  });

  it("a screen is never its own parent", () => {
    expect(Object.keys(ROUTE_PARENTS).filter((pattern) => parentOf(pattern, sample)?.split("?")[0] === pattern)).toEqual([]);
  });
});
