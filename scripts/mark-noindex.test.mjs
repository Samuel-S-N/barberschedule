import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { markNoindex } from "./mark-noindex.mjs";

const fresh = (headers) => {
  const dir = mkdtempSync(join(tmpdir(), "noindex-"));

  if (headers !== undefined) writeFileSync(join(dir, "_headers"), headers);

  return dir;
};

test("adds X-Robots-Tag to every path and keeps the existing header rules", () => {
  const dir = fresh("/sw.js\n  Cache-Control: no-cache\n");

  markNoindex(dir);
  const headers = readFileSync(join(dir, "_headers"), "utf8");

  assert.match(headers, /^\/sw\.js\n {2}Cache-Control: no-cache\n/);
  assert.match(headers, /\n\/\*\n {2}X-Robots-Tag: noindex, nofollow\n$/);
});

test("writes a robots.txt that disallows everything", () => {
  const dir = fresh("");

  markNoindex(dir);
  assert.equal(readFileSync(join(dir, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
});

test("creates _headers when the build has none, and is idempotent", () => {
  const dir = fresh();

  markNoindex(dir);
  markNoindex(dir);
  const headers = readFileSync(join(dir, "_headers"), "utf8");

  assert.equal(headers.match(/X-Robots-Tag/g)?.length, 1);
});
