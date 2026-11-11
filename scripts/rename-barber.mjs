// One-off: barber -> professional across tracked files (content and paths).
// Brand "barberschedule", Spanish "barbero/barbería" and "barbershop" are left alone.
// Deleted in the last task of docs/superpowers/plans/2026-11-11-professional-rename.md.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

const KEEP = "(?!schedule|shop|o|[ií]a)";
const RULES = [
  [new RegExp(`barber${KEEP}`, "g"), "professional"],
  [new RegExp(`Barber${KEEP}`, "g"), "Professional"],
  [/BARBER(?!SCHEDULE)/g, "PROFESSIONAL"],
];

export const renameText = (text) => RULES.reduce((acc, [re, to]) => acc.replace(re, to), text);

const SKIP = /^scripts\/rename-barber(\.test)?\.mjs$/;

function main(paths, dry) {
  const files = execFileSync("git", ["ls-files", "-z", "--", ...paths], { encoding: "utf8" })
    .split("\0")
    .filter((file) => file && !SKIP.test(file));
  let edited = 0;
  const moves = [];
  for (const file of files) {
    const buf = readFileSync(file);
    if (!buf.includes(0)) {
      const before = buf.toString("utf8");
      const after = renameText(before);
      if (after !== before) {
        edited++;
        if (!dry) writeFileSync(file, after);
      }
    }
    const target = renameText(file);
    if (target !== file) {
      if (existsSync(target)) throw new Error(`${target} already exists`);
      moves.push([file, target]);
    }
  }
  if (!dry) {
    for (const [from, to] of moves) {
      mkdirSync(dirname(to), { recursive: true });
      execFileSync("git", ["mv", from, to]);
    }
  }
  console.log(`${dry ? "[dry] " : ""}edited ${edited} files, moved ${moves.length}`);
  for (const [from, to] of moves) console.log(`  ${from} -> ${to}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  main(args.filter((arg) => arg !== "--dry"), args.includes("--dry"));
}
