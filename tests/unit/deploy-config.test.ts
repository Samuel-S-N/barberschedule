import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("supabase/config.toml hosted overrides", () => {
  const config = read("supabase/config.toml");
  const section = (name: string) => config.split(`[remotes.${name}]`)[1]?.split(/\n\[(?!remotes\.)/)[0] ?? "";

  it("has a dev remote with its project id", () => {
    expect(section("dev")).toMatch(/project_id = "[a-z]{20}"/);
  });

  it("never lets a hosted project inherit the local auth values", () => {
    const dev = config.split("[remotes.dev.auth]")[1]?.split("\n[remotes.dev.")[0] ?? "";

    expect(dev).toMatch(/site_url = "https:\/\/zenc-web-dev\./);
    expect(dev).toContain('"https://zenc-web-dev.');
    expect(dev).not.toMatch(/127\.0\.0\.1|localhost/);
    expect(config).toMatch(/\[remotes\.dev\.auth\.email\][^[]*enable_confirmations = true/);
    expect(config).toMatch(/\[remotes\.dev\.auth\.email\.smtp\][^[]*admin_email = "nao-responda@zencpro\.com\.br"[^[]*sender_name = "Zenc"/);
    expect(config).toMatch(/\[remotes\.dev\.auth\.email\.smtp\][^[]*pass = "env\(RESEND_API_KEY\)"/);
  });

  // Hosted-only values the owner must not lose to the local defaults (found by spike S3, 2026-11-26).
  const remotes = [...config.matchAll(/^\[remotes\.([a-z]+)\.auth\.email\.smtp\]/gm)].map((match) => match[1]);
  const block = (header: string) => config.split(`[${header}]`)[1]?.split("\n[")[0] ?? "";

  it("every hosted remote turns custom SMTP on (the free tier rejects template changes with the default e-mail provider)", () => {
    expect(remotes.length).toBeGreaterThan(0);
    for (const name of remotes) expect(block(`remotes.${name}.auth.email.smtp`)).toMatch(/^enabled = true$/m);
  });

  it("every hosted remote keeps the one-minute e-mail rate limit instead of the local 1s", () => {
    for (const name of remotes) expect(block(`remotes.${name}.auth.email`)).toMatch(/^max_frequency = "1m0s"$/m);
  });

  it("hands the cron job its URL and token through Vault, from the environment", () => {
    expect(config).toMatch(/\[remotes\.dev\.db\.vault\][^[]*dispatch_url = "env\(DISPATCH_URL\)"[^[]*dispatch_token = "env\(DISPATCH_TOKEN\)"/);
  });
});

describe("supabase/config.toml production overrides", () => {
  const config = read("supabase/config.toml");
  const section = (name: string) => config.split(`[remotes.${name}]`)[1]?.split(/\n\[(?!remotes\.)/)[0] ?? "";
  const prod = config.split("[remotes.prod.auth]")[1]?.split("\n[remotes.prod.")[0] ?? "";

  it("sends invites and recovery links to each business's own address", () => {
    expect(section("prod")).toMatch(/project_id = "[a-z]{20}"/);
    expect(prod).toContain('site_url = "https://zencpro.app"');
    expect(prod).toContain('"https://zencpro.app/**"');
    expect(prod).toContain('"https://*.zencpro.app/**"');
    expect(prod).not.toMatch(/127\.0\.0\.1|localhost|exp:\/\//);
    expect(config).toMatch(/\[remotes\.prod\.auth\.email\][^[]*enable_confirmations = true/);
    expect(config).toMatch(/\[remotes\.prod\.auth\.email\.smtp\][^[]*pass = "env\(RESEND_API_KEY\)"/);
    expect(config).toMatch(/\[remotes\.prod\.db\.vault\][^[]*dispatch_url = "env\(DISPATCH_URL\)"[^[]*dispatch_token = "env\(DISPATCH_TOKEN\)"/);
  });

  it("dev and prod are different projects", () => {
    const ref = (name: string) => section(name).match(/project_id = "([a-z]{20})"/)?.[1];

    expect(ref("dev")).toBeDefined();
    expect(ref("prod")).toBeDefined();
    expect(ref("dev")).not.toBe(ref("prod"));
  });
});

describe("wrangler.jsonc", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));

  it("serves the web export as a single-page app on the free workers.dev address (dev)", () => {
    expect(wrangler.name).toBe("zenc-web-dev");
    expect(wrangler.assets).toEqual({ directory: "./dist", not_found_handling: "single-page-application" });
    expect(wrangler.workers_dev).toBe(true);
    expect(wrangler.preview_urls).toBe(false);
  });
});

describe("wrangler.jsonc production", () => {
  const production = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, "")).env.production;

  it("is its own Worker on the apex and every business subdomain, never on workers.dev", () => {
    expect(production.name).toBe("zenc-web");
    expect(production.workers_dev).toBe(false);
    expect(production.preview_urls).toBe(false);
    expect(production.routes).toEqual([
      { pattern: "zencpro.app/*", zone_name: "zencpro.app" },
      { pattern: "*.zencpro.app/*", zone_name: "zencpro.app" },
    ]);
    expect(production.assets).toEqual({ directory: "./dist", not_found_handling: "single-page-application" });
  });
});

describe("public/_headers", () => {
  it("never caches the service worker or the manifest", () => {
    const headers = read("public/_headers");

    expect(headers).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
    expect(headers).toMatch(/\/manifest\.json\n\s+Cache-Control: no-cache/);
  });
});

describe("workflows", () => {
  const verify = read(".github/workflows/verify.yml");
  const deploy = read(".github/workflows/deploy.yml");
  const deployEnv = read(".github/workflows/deploy-env.yml");

  it("verify runs on pull requests and when called, not on every push", () => {
    expect(verify).toContain("pull_request:");
    expect(verify).toContain("workflow_call:");
    expect(verify).not.toMatch(/^ {2}push:/m);
    expect(verify).toContain("npm run verify");
  });

  it("deploy runs only for main, verifies first, never overlaps and never cancels a running deploy", () => {
    expect(deploy).toMatch(/branches: \[main\]/);
    expect(deploy).toContain("uses: ./.github/workflows/verify.yml");
    expect(deploy).toMatch(/concurrency:\s+group: deploy\s+cancel-in-progress: false/);
    expect(deploy).toMatch(/dev:\s+needs: verify\s+uses: \.\/\.github\/workflows\/deploy-env\.yml\s+with:\s+environment: dev/);
  });

  it("the deploy steps are one reusable workflow, never push seed data and never reset", () => {
    expect(deployEnv).toContain("workflow_call:");
    expect(deployEnv).toContain("environment: ${{ inputs.environment }}");
    expect(deployEnv).not.toMatch(/--include-seed|db reset/);
    for (const command of ["npx supabase db push --linked", "npx supabase config push", "npx supabase functions deploy", "npx wrangler deploy", "npx sentry-expo-upload-sourcemaps"]) {
      expect(deployEnv).toContain(command);
    }
  });

  it("production waits for dev and for the production environment's reviewer, on the same commit", () => {
    expect(deploy).toMatch(/production:\s+needs: dev\s+uses: \.\/\.github\/workflows\/deploy-env\.yml\s+with:\s+environment: production\s+secrets: inherit/);
    expect(deploy).not.toMatch(/ref:/);
  });

  it("the production run checks the live site and the e-mail logo after deploying", () => {
    expect(deployEnv).toContain("inputs.environment == 'production'");
    expect(deployEnv).toContain("https://zencpro.app/email/zenc-logo.png");
    expect(deployEnv).toContain("image/png");
    expect(deployEnv.indexOf("https://zencpro.app/email/zenc-logo.png")).toBeGreaterThan(deployEnv.indexOf("wrangler deploy"));
  });

  it("deploys the database before anything that depends on it, and the web build last", () => {
    const order = ["supabase db push", "supabase config push", "supabase functions deploy", "expo export", "wrangler deploy"].map((step) => deployEnv.indexOf(step));

    expect(order.every((position) => position > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("refuses to run while a placeholder is left in the hosted config, or when its project is not in config.toml", () => {
    expect(deployEnv).toContain("REPLACE-");
    expect(deployEnv).toContain('project_id = \\"$REF\\"');
  });

  it("source maps are uploaded and then removed from what is published", () => {
    expect(deployEnv).toContain("--source-maps");
    expect(deployEnv.indexOf("sentry-expo-upload-sourcemaps")).toBeLessThan(deployEnv.indexOf("-name '*.map' -delete"));
    expect(deployEnv.indexOf("-name '*.map' -delete")).toBeLessThan(deployEnv.indexOf("wrangler deploy"));
  });

  it("the backup runs nightly in its own environment, holds only backup credentials and never uploads an unencrypted artifact", () => {
    const backup = read(".github/workflows/backup.yml");

    expect(backup).toMatch(/cron: "0 5 \* \* \*"/);
    expect(backup).toContain("workflow_dispatch:");
    expect(backup).toContain("environment: backup");
    expect(backup).toContain("bash scripts/backup.sh");
    expect(backup).not.toContain("upload-artifact");
    expect(backup).not.toMatch(/SUPABASE_ACCESS_TOKEN|CLOUDFLARE_API_TOKEN|RESEND_API_KEY/);
    for (const name of [...backup.matchAll(/\bsecrets\.([A-Z0-9_]+)/g)].map((match) => match[1])) {
      expect(["SUPABASE_DB_URL", "AGE_PUBLIC_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]).toContain(name);
    }
  });

  it("the auth e-mail logo follows the environment's site before config push, and production's site is the one the templates already use", () => {
    const step = 'node scripts/set-email-logo.mjs "$REF"';
    const config = read("supabase/config.toml");
    const siteOf = (name: string) => (config.split(`[remotes.${name}.auth]`)[1]?.split("\n[")[0] ?? "").match(/^site_url = "([^"]+)"/m)?.[1];

    expect(deployEnv).toContain(step);
    expect(deployEnv).not.toMatch(/if:[^\n]*\n\s+run: node scripts\/set-email-logo/);
    expect(deployEnv.indexOf(step)).toBeLessThan(deployEnv.indexOf("supabase config push"));
    expect(deployEnv.indexOf(step)).toBeGreaterThan(deployEnv.indexOf("Hosted config is filled in"));
    expect(siteOf("dev")).toMatch(/^https:\/\/zenc-web-dev\./);
    expect(read("supabase/templates/invite.html")).toContain("https://zencpro.app/email/zenc-logo.png");
    // Where a production remote exists its site is exactly the address the templates (and the reminder default) use.
    if (siteOf("prod")) expect(siteOf("prod")).toBe("https://zencpro.app");
  });

  it("only the non-production builds are marked noindex; production stays indexable", () => {
    const step = "node scripts/mark-noindex.mjs dist";

    expect(deployEnv).toContain(step);
    expect(deployEnv).toMatch(/- if: \$\{\{ inputs\.environment != 'production' \}\}\n\s+run: node scripts\/mark-noindex\.mjs dist/);
    expect(deployEnv.indexOf(step)).toBeLessThan(deployEnv.indexOf("wrangler deploy"));
    expect(deployEnv.indexOf(step)).toBeGreaterThan(deployEnv.indexOf("-name '*.map' -delete"));
    // The files that ship in every environment must not carry it.
    expect(read("public/_headers")).not.toMatch(/X-Robots-Tag/i);
    expect(existsSync(join(root, "public", "robots.txt"))).toBe(false);
  });

  it("every secret and variable a workflow reads is documented in docs/hosted-deploy.md", () => {
    const docs = read("docs/hosted-deploy.md");
    const used = new Set([...(verify + deploy + deployEnv + read(".github/workflows/backup.yml")).matchAll(/\b(?:secrets|vars)\.([A-Z0-9_]+)/g)].map((match) => match[1]));

    expect(used.size).toBeGreaterThan(5);
    for (const name of used) expect(docs).toContain(name);
  });
});
