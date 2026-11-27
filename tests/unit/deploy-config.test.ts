import { readFileSync } from "node:fs";
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

describe("wrangler.jsonc", () => {
  const wrangler = JSON.parse(read("wrangler.jsonc").replace(/^\s*\/\/.*$/gm, ""));

  it("serves the web export as a single-page app on the free workers.dev address (dev)", () => {
    expect(wrangler.name).toBe("zenc-web-dev");
    expect(wrangler.assets).toEqual({ directory: "./dist", not_found_handling: "single-page-application" });
    expect(wrangler.workers_dev).toBe(true);
    expect(wrangler.preview_urls).toBe(false);
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

  it("every secret and variable a workflow reads is documented in docs/hosted-deploy.md", () => {
    const docs = read("docs/hosted-deploy.md");
    const used = new Set([...(verify + deploy + deployEnv).matchAll(/\b(?:secrets|vars)\.([A-Z0-9_]+)/g)].map((match) => match[1]));

    expect(used.size).toBeGreaterThan(5);
    for (const name of used) expect(docs).toContain(name);
  });
});
