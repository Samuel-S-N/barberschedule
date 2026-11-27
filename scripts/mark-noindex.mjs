// Keeps the public dev/demo site out of search engines: an X-Robots-Tag header on every path (Cloudflare Workers reads dist/_headers)
// and a robots.txt that disallows everything. Run by deploy-env.yml for every environment EXCEPT production, on the built `dist`.
// Usage: node scripts/mark-noindex.mjs dist
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const RULE = "/*\n  X-Robots-Tag: noindex, nofollow\n";

export function markNoindex(dir) {
  const file = join(dir, "_headers");
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";

  if (!current.includes("X-Robots-Tag")) writeFileSync(file, `${current}${current && !current.endsWith("\n") ? "\n" : ""}${RULE}`);
  writeFileSync(join(dir, "robots.txt"), "User-agent: *\nDisallow: /\n");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];

  if (!dir) {
    console.error("Usage: node scripts/mark-noindex.mjs <dist>");
    process.exit(1);
  }
  markNoindex(dir);
  console.log(`Marked ${dir} noindex (X-Robots-Tag header and robots.txt).`);
}
