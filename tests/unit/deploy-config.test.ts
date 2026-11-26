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
