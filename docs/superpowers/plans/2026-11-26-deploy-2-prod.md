# Deploy 2: production promotion and the first business Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The same commit that reached dev can be promoted, by one approval from the user, to `zenc-prod` and to the `zenc-web` Worker on `zencpro.app` and `*.zencpro.app`, and the first real business is created and opened.

**Architecture:** Reuses plan 1's `deploy-env.yml`. Adds `[remotes.prod]` in `supabase/config.toml`, an `env.production` block in `wrangler.jsonc` (Workers Routes plus proxied DNS, because Custom Domains cannot be wildcards), a `production` job in `deploy.yml` gated by the GitHub Environment `production`, production-only smoke checks, and the runbook for the first business.

**Tech Stack:** GitHub Environments, Cloudflare Workers Routes and DNS, Supabase CLI, Resend, `scripts/create-shop.mjs`, Jest.

**Spec:** `docs/superpowers/specs/2026-11-26-deploy-05-design.md` (4.1, 4.2, 4.4, 6 items B10 to B12).

## Global Constraints

- Plan 1 is merged and dev is healthy (first dev deploy green, hosted dev checks of plan 1 Task 9 done). Do not start before.
- Migrations are append-only from the first production deploy on (decision `018`): after the production run no applied file is edited, ever. A mistake gets a new migration.
- Never `db reset`, never `--include-seed`, never run `create-shop.mjs` or any SQL against production from CI or from Claude: the user pastes the service-role key and runs it (spec section 6).
- Production approvals: GitHub Environment `production`, required reviewer = the user. A pending review is the promotion; nothing else deploys production.
- Say estabelecimento/negócio, never barbearia/barbershop.
- Strict TDD for the config and workflow edits; one commit per task; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gates: `npx tsc --noEmit`, root `npm run lint` after the last commit, full `npx jest` (no "did not exit"), `npx supabase test db` unchanged (known 010/012/016/055 failures), `npm run test:e2e:runner`. No app code changes in this plan, so no Playwright run is required.

## File Structure

| File | Responsibility |
|---|---|
| `wrangler.jsonc` | `env.production`: Worker `zenc-web`, routes on `zencpro.app` |
| `supabase/config.toml` | `[remotes.prod]` hosted overrides |
| `.github/workflows/deploy.yml`, `deploy-env.yml` | `production` job; production smoke steps |
| `tests/unit/deploy-config.test.ts` | guards for all of the above |
| `docs/hosted-deploy.md`, `docs/release.md`, `docs/decisions/019-hosted-environments.md` | operator docs and the decision record |

---

### Task 1: Production Worker config (routes on the zone)

**Files:**
- Modify: `wrangler.jsonc`, `tests/unit/deploy-config.test.ts`

- [ ] **Step 1: Write the failing test** (append to the `wrangler.jsonc` describe)

```ts
  it("has a production environment on the apex and every business subdomain, never on workers.dev", () => {
    const production = wrangler.env.production;

    expect(production.name).toBe("zenc-web");
    expect(production.workers_dev).toBe(false);
    expect(production.preview_urls).toBe(false);
    expect(production.routes).toEqual([
      { pattern: "zencpro.app/*", zone_name: "zencpro.app" },
      { pattern: "*.zencpro.app/*", zone_name: "zencpro.app" },
    ]);
    expect(production.assets).toEqual({ directory: "./dist", not_found_handling: "single-page-application" });
  });
```

- [ ] **Step 2: Run** `npx jest tests/unit/deploy-config.test.ts` (FAIL), then add to `wrangler.jsonc`, inside the top-level object (update the header comment to say production is defined here; `assets` is restated because environments must not depend on inheritance rules):

```jsonc
  "env": {
    "production": {
      "name": "zenc-web",
      "workers_dev": false,
      "preview_urls": false,
      "assets": { "directory": "./dist", "not_found_handling": "single-page-application" },
      "routes": [
        { "pattern": "zencpro.app/*", "zone_name": "zencpro.app" },
        { "pattern": "*.zencpro.app/*", "zone_name": "zencpro.app" }
      ]
    }
  }
```

- [ ] **Step 3:** Test PASS. Local validation of the file (no deploy): `npx wrangler deploy --env production --dry-run --outdir /tmp/zenc-wrangler-check` after `npm run export:web`; it must print the two routes and no error. (If the S1 spike required `src/worker.js`, restate `main` and the asset binding in the production block too and extend the test.)
- [ ] **Step 4: Commit** `feat(deploy): production Worker on zencpro.app and *.zencpro.app`

---

### Task 2: `[remotes.prod]` hosted auth config

**Files:**
- Modify: `supabase/config.toml`, `tests/unit/deploy-config.test.ts`

- [ ] **Step 1: Write the failing test** (append to the config describe)

```ts
  it("has a prod remote that sends invites and recovery links to each business's own address", () => {
    const prod = config.split("[remotes.prod.auth]")[1]?.split("\n[remotes.prod.")[0] ?? "";

    expect(section("prod")).toMatch(/project_id = "[a-z]{20}"/);
    expect(prod).toContain('site_url = "https://zencpro.app"');
    expect(prod).toContain('"https://*.zencpro.app/**"');
    expect(prod).toContain('"https://zencpro.app/**"');
    expect(prod).not.toMatch(/127\.0\.0\.1|localhost|exp:\/\//);
    expect(config).toMatch(/\[remotes\.prod\.auth\.email\][^[]*enable_confirmations = true/);
    expect(config).toMatch(/\[remotes\.prod\.auth\.email\.smtp\][^[]*pass = "env\(RESEND_API_KEY\)"/);
  });

  it("dev and prod are different projects", () => {
    const ref = (name: string) => section(name).match(/project_id = "([a-z]{20})"/)?.[1];

    expect(ref("dev")).toBeDefined();
    expect(ref("prod")).toBeDefined();
    expect(ref("dev")).not.toBe(ref("prod"));
  });
```

- [ ] **Step 2: Run (FAIL); implement.** The user provides the production ref (spec checklist A3). Append to `supabase/config.toml`:

```toml
[remotes.prod]
project_id = "<PROD_REF>"

[remotes.prod.auth]
site_url = "https://zencpro.app"
# Invites and password recovery redirect to each business's own subdomain; without the wildcard the e-mail link is refused and falls
# back to the site URL. No exp:// (local only). zenc:// stays for the later store build.
additional_redirect_urls = ["https://zencpro.app/**", "https://*.zencpro.app/**", "zenc://**"]

[remotes.prod.auth.email]
enable_confirmations = true

[remotes.prod.auth.email.smtp]
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(RESEND_API_KEY)"
admin_email = "nao-responda@zencpro.com.br"
sender_name = "Zenc"

[remotes.prod.db.vault]
dispatch_url = "env(DISPATCH_URL)"
dispatch_token = "env(DISPATCH_TOKEN)"
```

If plan 1 Task 8 Step 5 fell back to the manual SQL for Vault, omit the last block and keep the same manual step for production (user, SQL editor, once).

- [ ] **Step 3:** Tests PASS. User runs `npx supabase config push --project-ref <PROD_REF>` and answers "no" at the prompt: the diff must show only the production values (https://zencpro.app, the wildcard list, SMTP, confirmations true).
- [ ] **Step 4: Commit** `feat(config): hosted production auth overrides in [remotes.prod]`

---

### Task 3: The `production` job and its smoke checks

**Files:**
- Modify: `.github/workflows/deploy.yml`, `.github/workflows/deploy-env.yml`, `tests/unit/deploy-config.test.ts`

- [ ] **Step 1: Write the failing tests** (append to the workflows describe)

```ts
  it("production waits for dev and for the production environment's reviewer", () => {
    expect(deploy).toMatch(/production:\s+needs: dev\s+uses: \.\/\.github\/workflows\/deploy-env\.yml\s+with:\s+environment: production/);
  });

  it("the production run checks the live site and the e-mail logo after deploying", () => {
    expect(deployEnv).toContain("inputs.environment == 'production'");
    expect(deployEnv).toContain("https://zencpro.app/email/zenc-logo.png");
    expect(deployEnv).toContain("image/png");
  });
```

- [ ] **Step 2: Run (FAIL); append to `deploy.yml`**

```yaml
  production:
    needs: dev
    uses: ./.github/workflows/deploy-env.yml
    with:
      environment: production
    secrets: inherit
```

and append to the end of the steps in `deploy-env.yml`:

```yaml
      # Production only: the apex answers, and the e-mail logo (a static file of this web app, referenced by every e-mail) is served.
      - if: ${{ inputs.environment == 'production' }}
        run: |
          curl -fsS -o /dev/null https://zencpro.app/
          test "$(curl -s -o /dev/null -w '%{content_type}' https://zencpro.app/email/zenc-logo.png)" = "image/png"
```

- [ ] **Step 3:** Tests PASS; `npm run lint`.
- [ ] **Step 4: Commit** `ci: promote the same commit to production behind the production environment`

---

### Task 4: User setup before the first production run (human steps)

None of this is automated; the user does it, in this order. Each line says where the value goes.

- [ ] **GitHub, environment `production`** (Settings > Environments > production): required reviewer = the user; deployment branches = `main` only. Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` (prod DB password), `RESEND_API_KEY` (the `zenc-prod` key), `DISPATCH_TOKEN` (new `openssl rand -hex 32`, a different value from dev), `CLOUDFLARE_API_TOKEN`, `SENTRY_AUTH_TOKEN`. Variables: `SUPABASE_PROJECT_REF`, `CLOUDFLARE_ACCOUNT_ID`, `EXPO_PUBLIC_SUPABASE_URL` (`https://<PROD_REF>.supabase.co`), `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (prod publishable key), `EXPO_PUBLIC_SHOP_BASE_DOMAIN=zencpro.app`, `EXPO_PUBLIC_AUTH_COOKIE_DOMAIN=.zencpro.app`, `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (prod public key), `EXPO_PUBLIC_SENTRY_DSN` (the `zenc-app` DSN; the same project receives both environments, told apart by the `environment` tag). `EXPO_PUBLIC_DEV_SHOP_SLUG` stays unset.
- [ ] **Cloudflare API token scope:** the plan-1 token already has Workers edit; for production it also needs `Zone > Workers Routes > Edit` on `zencpro.app` (create a second token `zenc-deploy-prod`, never reuse the dev token).
- [ ] **Cloudflare DNS, zone `zencpro.app`:** add `A` record name `@` content `192.0.2.1` **proxied** (orange cloud), and `A` record name `*` content `192.0.2.1` **proxied**. The address is a placeholder: the Worker Route answers before it is ever contacted. Explicit records (if any) keep priority over the wildcard. Check SSL/TLS mode is "Full (strict)".
- [ ] **Supabase function secrets on `zenc-prod`** (Dashboard > Edge Functions > Secrets, or `npx supabase secrets set --project-ref <PROD_REF> ...` typed by the user): `RESEND_API_KEY`, `EMAIL_FROM="Zenc <nao-responda@zencpro.com.br>"`, `SHOP_URL_TEMPLATE=https://{slug}.zencpro.app`, `DISPATCH_TOKEN` (the same value as the GitHub secret), `SENTRY_DSN_FUNCTIONS`, `SENTRY_ENVIRONMENT=production`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:contato@zencpro.com.br`.
- [ ] **Cloudflare Email Routing for `zencpro.com.br`:** Email > Email Routing > enable; custom addresses `contato@` and `privacidade@` forward to `zencpro.admin@gmail.com`; confirm the verification e-mail Cloudflare sends there. These two addresses are printed in the legal texts and in every automatic e-mail, so they must work before the first invite goes out.
- [ ] **Resend:** the domain `zencpro.com.br` shows "Verified" and the `zenc-prod` key can send from it.

---

### Task 5: The first production deploy

- [ ] **Step 1: Pre-flight (read only).** User runs `npx supabase link --project-ref <PROD_REF>` then `npx supabase db push --dry-run`. Expected: **all 83 migrations** (`0001` to `0083`) are listed and nothing else; the production database is empty, so there are no duplicate e-mail checks to do (the old `0031` precheck in the previous checklist is obsolete). Then `npx supabase unlink` is not needed; the CI run links by itself.
- [ ] **Step 2: Promote.** Merge to `main` (or Actions > deploy > Run workflow on `main`). `verify` and `dev` run; the `production` job waits. In the run page: "Review deployments" > tick `production` > Approve. This is the first and last time migrations are applied from zero; after it, append-only.
- [ ] **Step 3: Read the run.** Expected: `db push` applies `0001` to `0083`; `config push` applies the prod values; three functions deploy; the web bundle uploads; `assert-hosted-auth` prints OK; the OPTIONS check answers 204; `curl` of the apex and the logo pass.
- [ ] **Step 4: Verify the Vault values** (SQL editor of `zenc-prod`): `select name from vault.decrypted_secrets order by name;` lists `dispatch_token` and `dispatch_url` (never select the secret column in front of anyone). Then `select jobname, schedule, active from cron.job order by jobname;` lists four active jobs: `barberschedule-payout-due`, `zenc-dispatch-notifications`, `zenc-materialize-recurrence`, `zenc-notification-reminders`.
- [ ] **Step 5: Turn the e-mail claim on** only now, because confirmations are enforced (the CI step proved it): SQL editor, `update public.app_settings set email_claim_enabled = true;`. (Decision `011`: a customer who signs up with a verified e-mail that a professional already used gets that history.)
- [ ] **Step 6: Bare domain.** Open `https://zencpro.app/`: the page that asks for the business's link appears (not an error). Open `https://anything.zencpro.app/`: "negócio não encontrado".
- [ ] **Step 7: Sentry.** In `zenc-app`, no event is expected yet; after the first business (Task 6) trigger one deliberate test (plan 1 Task 9 Step 2.4 method on a local branch against production is **not** allowed: use a throwaway local build pointed at dev instead). Production only needs to show that the dev events carry `environment: dev` and a future production event will carry `production`.

---

### Task 6: Create the first real business (runbook)

The user decides the business (name, slug, the owner's e-mail, time zone). Slugs are permanent addresses and follow `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$`, not in the reserved list (`www app api admin zenc mail email smtp static assets cdn docs help support status blog dev staging test login auth`).

- [ ] **Step 1: Run the script from the user's computer** (the service-role key is pasted by the user into their own shell; use a leading space or `read -s` so it stays out of history):

```bash
read -rs SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL=https://<PROD_REF>.supabase.co SHOP_URL_TEMPLATE='https://{slug}.zencpro.app' node scripts/create-shop.mjs --name "<Nome do negócio>" --slug <slug> --owner <owner e-mail> --timezone America/Sao_Paulo
unset SUPABASE_SERVICE_ROLE_KEY
```

Expected output: the business was created and the invite e-mail was sent to the owner (the script checks the slug first and sends nothing if it is taken). 

- [ ] **Step 2: Owner side (watch together).** The owner receives "Você foi convidado para <negócio> na Zenc" from `Zenc <nao-responda@zencpro.com.br>` with the logo, the footer "Este e-mail é automático...", and a button to `https://<slug>.zencpro.app/reset-password`. They set a password, sign in, and see the setup checklist (readiness part C): agreement, details, hours, a service, a team member. "Abrir minha agenda" opens the business and shows the link and QR code. Before that, a visitor to `https://<slug>.zencpro.app/` sees "Em breve".
- [ ] **Step 3: Verify in the database (SQL editor, read only):** `select slug, name, setup_completed_at is not null as open from public.shops order by created_at desc limit 3;`.
- [ ] **Step 4: Smoke on production as a customer** (use a real address of the user's): sign up on `https://<slug>.zencpro.app/`, confirm the e-mail from the link, book an appointment for tomorrow, then in the SQL editor `select public.enqueue_notification_reminders();` and within two minutes the reminder e-mail arrives (the 100 mails/day Resend limit is shared with dev; do this once). Switch "Lembretes por e-mail" off and confirm no second reminder row appears.
- [ ] **Step 5: Phone/Safari check** on a real device (iPhone Safari): install the PWA from `https://<slug>.zencpro.app/`, sign in, enable push. Record the result; the spec lists it as unverified.

---

### Task 7: Docs and the decision record

**Files:**
- Modify: `docs/hosted-deploy.md`, `docs/release.md`
- Create: `docs/decisions/019-hosted-environments.md`

- [ ] **Step 1:** In `docs/hosted-deploy.md` mark production live, keep the secrets matrix in sync with the workflows (the Task 8 test of plan 1 enforces that), keep the legal (section 8), setup checklist (section 9) and e-mail (section 10) parts, and add a "Rollback and recovery" paragraph: migrations are forward-only; recovery is the restore runbook (`docs/restore-runbook.md`, plan 3), not edits.
- [ ] **Step 2:** `docs/release.md`: replace the environment section with the real flow (merge to `main`, dev, approve production) and remove the EAS paragraph from the 0.5 path (keep it as a later section).
- [ ] **Step 3:** `docs/decisions/019-hosted-environments.md` (same format as `018`: Context, Decision, Consequences): single `main`, flow A, Workers + Access, `[remotes.*]`, `DISPATCH_TOKEN` and the cron dispatch, Sentry errors-only with scrubbing, R2 backups with `age`, least privilege, append-only migrations from the first production deploy. Link the spec and the three plans.
- [ ] **Step 4: Gates** (list in Global Constraints) and commit `docs(deploy): production is live; decision 019`.

---

## Self-review

- Spec coverage: 4.1 production job and approval (Task 3 and 4), 4.2 `[remotes.prod]` and secrets (Tasks 2 and 4), 4.4 production Worker, routes, DNS, cookies (Tasks 1 and 4; cookie domain is the variable in Task 4), checklist B10 to B12 (Tasks 4 and 5), first business (Task 6), append-only note (constraints, Task 7). Backups and the restore runbook are plan 3.
- Placeholders: `<PROD_REF>` is the production project ref supplied by the user; `<slug>`, `<Nome do negócio>`, `<owner e-mail>` are per business.
- Consistency: workflow names, job names (`dev`, `production`), Worker names (`zenc-web-dev`, `zenc-web`), vault secret names and the matrix variables match plan 1.
- Risk carried from the spec: wildcard Routes need the proxied wildcard record; if the first request to `https://<slug>.zencpro.app/` gives a Cloudflare 522 or 1000-series error, the DNS record is missing or not proxied (Task 4 third bullet).
