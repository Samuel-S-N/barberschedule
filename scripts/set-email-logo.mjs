// The auth e-mail templates load the logo from the web app's own static file. They are written for production (https://zencpro.app); hosted
// dev serves the same file from its own site (zencpro.app serves nothing until production is live). deploy-env.yml runs this on the CI
// workspace right before `config push`, so the repository's templates stay as they are and production's site is zencpro.app (no change).
// Usage: node scripts/set-email-logo.mjs <supabase project ref>   (the site is the [remotes.*.auth] site_url of that project)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PRODUCTION_LOGO = "https://zencpro.app/email/zenc-logo.png";

export function logoSiteForProject(configToml, ref) {
  const name = [...configToml.matchAll(/^\[remotes\.([a-z]+)\]\s*\nproject_id = "([a-z]+)"/gm)].find((match) => match[2] === ref)?.[1];

  if (!name) throw new Error(`No [remotes.*] block for project ${ref} in supabase/config.toml`);
  const auth = configToml.split(`[remotes.${name}.auth]`)[1]?.split("\n[")[0] ?? "";
  const site = auth.match(/^site_url = "([^"]+)"/m)?.[1];

  if (!site) throw new Error(`[remotes.${name}.auth] has no site_url`);

  return site;
}

export function setEmailLogo(dir, site) {
  let origin;

  try {
    origin = new URL(site);
  } catch {
    origin = null;
  }
  if (!origin || origin.protocol !== "https:") throw new Error(`The logo site must be an https origin, got "${site}"`);

  const logo = `${origin.origin}/email/zenc-logo.png`;
  let changed = 0;

  for (const file of readdirSync(dir).filter((name) => name.endsWith(".html"))) {
    const path = join(dir, file);
    const html = readFileSync(path, "utf8");
    const next = html.replaceAll(PRODUCTION_LOGO, logo);

    if (next !== html) {
      writeFileSync(path, next);
      changed += 1;
    }
  }

  return changed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ref = process.argv[2];

  if (!ref) {
    console.error("Usage: node scripts/set-email-logo.mjs <project ref>");
    process.exit(1);
  }
  const site = logoSiteForProject(readFileSync("supabase/config.toml", "utf8"), ref);
  const changed = setEmailLogo("supabase/templates", site);

  console.log(`E-mail logo -> ${site}/email/zenc-logo.png (${changed} template(s) rewritten)`);
}
