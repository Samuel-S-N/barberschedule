# Deploy 3: nightly encrypted backups and the restore runbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night `zenc-prod` is dumped, encrypted with a key only the user holds, and stored in Cloudflare R2 (30 daily and 12 monthly kept), and a written runbook has been proven by restoring a real dump into `zenc-dev`.

**Architecture:** A small shell script `scripts/backup.sh` (tested with stubbed tools under `node --test`) does the work; `.github/workflows/backup.yml` only schedules it inside a dedicated GitHub Environment `backup` that holds the narrowest possible credentials. Retention is R2 lifecycle configuration, not code. The restore path is: new or emptied database, the normal deploy pipeline for schema, config and functions, then the data file.

**Tech Stack:** GitHub Actions (cron), Supabase CLI `db dump`, `age`, AWS CLI against the R2 S3 API, `psql`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-26-deploy-05-design.md` (4.6, 6 items C13 to C17, risks R7 and R9).

## Global Constraints

- The age **private** key never touches GitHub, the repo, a chat or this machine's disk beyond the moment of a restore; GitHub only ever holds the **public** key (`age1...`). The script refuses anything else.
- Claude never types or sees a secret. The user creates the bucket, the scoped R2 token, the key pair and pastes values (spec section 6).
- The `backup` GitHub Environment has no required reviewer (a nightly run must not wait for approval) and holds only: `SUPABASE_DB_URL`, `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. No Supabase token, no Cloudflare deploy token.
- Never print dump contents or the connection string in logs; never upload anything unencrypted anywhere (no `actions/upload-artifact` for dumps).
- Never `db reset` a hosted project. The drill uses truncation on `zenc-dev` only, run by the user.
- Say estabelecimento/negócio, never barbearia/barbershop.
- Strict TDD for the script; one commit per task; trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Gates: `npx tsc --noEmit`, root `npm run lint` after the last commit, full `npx jest`, `npm run test:e2e:runner` (now includes the backup script test), `npx supabase test db` unchanged (known 010/012/016/055). No app code changes, so no Playwright run.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/backup.sh` | dump, count, check, encrypt, upload, verify the upload |
| `scripts/backup.test.mjs` | `node --test` with stubbed `supabase`, `psql`, `age`, `aws` |
| `.github/workflows/backup.yml` | nightly schedule and manual trigger, environment `backup` |
| `docs/restore-runbook.md` | the proven restore procedure and the drill log |
| `package.json` | `test:e2e:runner` also runs `scripts/backup.test.mjs` |
| `docs/hosted-deploy.md` | short pointer to backups and the weekly check |

---

### Task 0: Spike P1 (what does a dump of this project really contain?)

Run against **zenc-dev** (not production) after plan 1 is live and the dev project has the demo business. The user runs it with the session-pooler string of `zenc-dev` (Supabase > Connect > Session pooler; typed only into their own shell).

- [ ] **Step 1:**

```bash
read -rs DEV_DB_URL && export DEV_DB_URL
mkdir -p /tmp/zenc-p1 && cd /tmp/zenc-p1
npx --prefix /home/samuel/projects/barberschedule supabase db dump --db-url "$DEV_DB_URL" -f roles.sql --role-only
npx --prefix /home/samuel/projects/barberschedule supabase db dump --db-url "$DEV_DB_URL" -f schema.sql
npx --prefix /home/samuel/projects/barberschedule supabase db dump --db-url "$DEV_DB_URL" -f data.sql --data-only --use-copy
grep -c '^COPY ' data.sql; grep -E '^COPY (auth\.users|public\.shops|public\.appointments|vault\.secrets|storage\.objects)' data.sql
```

Expected: the dump runs (the CLI uses Docker for a matching `pg_dump`); `COPY auth.users` and `COPY public.shops` are present. Record: whether `auth.users` is included (a backup without it cannot restore logins), whether `vault.secrets` appears (if it does, encryption is even more important), whether the dump needs the `--exclude` flags from Supabase's own backup guide (vector tables), and the time and size.
- [ ] **Step 2:** If `auth.users` is missing from `data.sql`, stop: add `--schema auth,public,storage` (or separate dumps) in Task 1 and re-run this spike. Write the result in the spec under R9 and delete `/tmp/zenc-p1` (`shred -u` the files).
- [ ] **Step 3: Note the storage gap (R10, new).** Avatars are Supabase Storage objects (`supabase.storage.from(AVATAR_BUCKET)`, migration `0027`). `db dump` saves the `storage.objects` rows (metadata) but **not the files**. Record the decision from the orchestrator (open question Q1 in the report): accepted gap for 0.5 (avatars can be re-uploaded) or an extra step in `backup.sh` that copies the bucket through Supabase's S3-compatible endpoint. This plan implements the accepted gap and documents it in the runbook; the extra step is a follow-up if chosen.
- [ ] **Step 4: Commit** the spec note: `docs(deploy): spike P1, what a dump contains`.

---

### Task 1: `scripts/backup.sh` with tests first

**Files:**
- Create: `scripts/backup.test.mjs`, `scripts/backup.sh`
- Modify: `package.json` (`test:e2e:runner`)

**Interfaces:**
- Produces: `scripts/backup.sh` (bash, `set -euo pipefail`), configured only by environment: `SUPABASE_DB_URL`, `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `BACKUP_DATE` (UTC `YYYY-MM-DD`, default today), optional `BACKUP_WORKDIR` (default a `mktemp -d`). It calls `supabase db dump`, `psql`, `age`, `aws`. Exit 0 only after the uploaded object's size matches the local file. Object keys: `daily/zenc-prod-<date>.tar.age`, plus `monthly/zenc-prod-<date>.tar.age` when the day of month is `01`.

- [ ] **Step 1: Write the failing test** `scripts/backup.test.mjs`. The stubs are tiny shell scripts in a temp `bin/` placed first on `PATH`; they log every call and imitate the real tools just enough.

```js
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const script = new URL("./backup.sh", import.meta.url).pathname;
const goodEnv = { AGE_PUBLIC_KEY: "age1" + "q".repeat(58), R2_ACCESS_KEY_ID: "id", R2_ACCOUNT_ID: "acct", R2_BUCKET: "zenc-backups", R2_SECRET_ACCESS_KEY: "secret", SUPABASE_DB_URL: "postgresql://u:p@host:5432/postgres" };

function sandbox({ emptySchema = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
  const bin = join(dir, "bin");
  const store = join(dir, "store");
  mkdirSync(bin);
  mkdirSync(store);
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/bin/bash\necho "${name} $*" >> "${dir}/calls.log"\n${body}\n`); chmodSync(join(bin, name), 0o755); };

  // supabase db dump ... -f <file> [--role-only|--data-only]: writes plausible content to <file>.
  stub("supabase", `file=""; mode=schema
while [ $# -gt 0 ]; do case "$1" in -f) file="$2"; shift;; --role-only) mode=roles;; --data-only) mode=data;; esac; shift; done
case $mode in roles) echo "CREATE ROLE x;" > "$file";; data) printf 'SET x = 1;\\nCOPY public.shops FROM stdin;\\n' > "$file";; schema) ${emptySchema ? 'true > "$file"' : 'echo "CREATE TABLE public.shops ();" > "$file"'};; esac`);
  stub("psql", `echo "public.shops,3"; echo "auth.users,5"`);
  stub("age", `out=""; while [ $# -gt 0 ]; do [ "$1" = "-o" ] && out="$2"; shift; done; cat > "$out"`);
  stub("aws", `if [ "$1 $2" = "s3 cp" ]; then key="\${4#s3://*/}"; mkdir -p "${store}/$(dirname "$key")"; cp "$3" "${store}/$key"; fi
if [ "$1 $2" = "s3api head-object" ]; then while [ $# -gt 0 ]; do [ "$1" = "--key" ] && key="$2"; shift; done; stat -c%s "${store}/$key"; fi`);

  return { dir, store, calls: () => readFileSync(join(dir, "calls.log"), "utf8"), run: (env) => spawnSync("bash", [script], { encoding: "utf8", env: { BACKUP_WORKDIR: join(dir, "work"), HOME: dir, PATH: `${bin}:${process.env.PATH}`, ...env } }) };
}

test("refuses to start without its configuration", () => {
  const box = sandbox();
  const result = box.run({ ...goodEnv, R2_BUCKET: "" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /R2_BUCKET/);
  assert.equal(existsSync(join(box.dir, "calls.log")), false);
});

test("refuses anything that is not an age public key, before touching the database", () => {
  for (const key of ["AGE-SECRET-KEY-1ABC", "ssh-ed25519 AAAA", "age1short"]) {
    const box = sandbox();
    const result = box.run({ ...goodEnv, AGE_PUBLIC_KEY: key });

    assert.notEqual(result.status, 0, key);
    assert.match(result.stderr, /AGE_PUBLIC_KEY/);
    assert.equal(existsSync(join(box.dir, "calls.log")), false);
  }
});

test("dumps roles, schema and data, encrypts to the recipient and uploads one daily object", () => {
  const box = sandbox();
  const result = box.run({ ...goodEnv, BACKUP_DATE: "2026-11-27" });

  assert.equal(result.status, 0, result.stderr);
  const calls = box.calls();

  assert.match(calls, /supabase db dump --db-url postgresql:\/\/u:p@host:5432\/postgres -f .*roles\.sql --role-only/);
  assert.match(calls, /supabase db dump --db-url .* -f .*schema\.sql/);
  assert.match(calls, /supabase db dump --db-url .* -f .*data\.sql --data-only --use-copy/);
  assert.match(calls, new RegExp(`age -r ${goodEnv.AGE_PUBLIC_KEY} -o .*zenc-prod-2026-11-27\\.tar\\.age`));
  assert.match(calls, /aws s3 cp .*zenc-prod-2026-11-27\.tar\.age s3:\/\/zenc-backups\/daily\/zenc-prod-2026-11-27\.tar\.age --endpoint-url https:\/\/acct\.r2\.cloudflarestorage\.com/);
  assert.doesNotMatch(calls, /monthly/);
  assert.equal(existsSync(join(box.store, "daily", "zenc-prod-2026-11-27.tar.age")), true);
});

test("on the first of the month it also keeps a monthly copy", () => {
  const box = sandbox();
  const result = box.run({ ...goodEnv, BACKUP_DATE: "2026-12-01" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(box.store, "daily", "zenc-prod-2026-12-01.tar.age")), true);
  assert.equal(existsSync(join(box.store, "monthly", "zenc-prod-2026-12-01.tar.age")), true);
});

test("the archive holds the three dumps and the row counts, and nothing readable leaves the machine", () => {
  const box = sandbox();

  box.run({ ...goodEnv, BACKUP_DATE: "2026-11-27" });
  const files = execFileSync("tar", ["-tf", join(box.store, "daily", "zenc-prod-2026-11-27.tar.age")], { encoding: "utf8" });

  for (const name of ["roles.sql", "schema.sql", "data.sql", "counts.csv"]) assert.match(files, new RegExp(name));
});

test("an empty schema dump fails the job and uploads nothing", () => {
  const box = sandbox({ emptySchema: true });
  const result = box.run({ ...goodEnv, BACKUP_DATE: "2026-11-27" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /schema/i);
  assert.equal(existsSync(join(box.store, "daily")), false);
});

test("a size mismatch after the upload fails the job", () => {
  const box = sandbox();
  writeFileSync(join(box.dir, "bin", "aws"), `#!/bin/bash\necho "aws $*" >> "${box.dir}/calls.log"\n[ "$1 $2" = "s3api head-object" ] && echo 1\nexit 0\n`);
  chmodSync(join(box.dir, "bin", "aws"), 0o755);
  const result = box.run({ ...goodEnv, BACKUP_DATE: "2026-11-27" });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /size/i);
});
```

The `age` stub copies stdin to the output file, so the "archive" in the store is the plain tar: that is deliberate for the test (it lets the test list its contents); the real `age` is exercised in Task 3.

- [ ] **Step 2: Run, expect FAIL:** `node --test scripts/backup.test.mjs` (the script does not exist).
- [ ] **Step 3: Implement** `scripts/backup.sh` (`chmod +x`):

```bash
#!/bin/bash
# Nightly production backup: dump -> row counts -> tar -> age (public key) -> R2. See docs/restore-runbook.md.
# Configuration comes only from the environment; nothing here prints dump contents or the connection string.
set -euo pipefail

for name in SUPABASE_DB_URL AGE_PUBLIC_KEY R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
  [ -n "${!name:-}" ] || { echo "Missing $name" >&2; exit 1; }
done

# Only a public key is acceptable: pasting the private key (AGE-SECRET-KEY-...) into GitHub would defeat the whole point.
[[ "$AGE_PUBLIC_KEY" =~ ^age1[a-z0-9]{58}$ ]] || { echo "AGE_PUBLIC_KEY must be an age public key (age1...)" >&2; exit 1; }

date_utc="${BACKUP_DATE:-$(date -u +%F)}"
work="${BACKUP_WORKDIR:-$(mktemp -d)}"
name="zenc-prod-${date_utc}.tar.age"
endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
mkdir -p "$work/dump"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/dump/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/dump/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/dump/data.sql" --data-only --use-copy

# Row counts per table, so a restore can be compared with its source (auth.users included: it holds the logins).
psql "$SUPABASE_DB_URL" -At -F, -c "
  select table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
  from information_schema.tables
  where table_type = 'BASE TABLE' and (table_schema = 'public' or (table_schema = 'auth' and table_name = 'users'))
  order by 1" > "$work/dump/counts.csv"

# Sanity: an empty or truncated dump must fail the job (a silent empty backup is the worst outcome).
[ -s "$work/dump/schema.sql" ] && grep -q 'CREATE TABLE' "$work/dump/schema.sql" || { echo "The schema dump is empty or has no tables" >&2; exit 1; }
[ -s "$work/dump/data.sql" ] || { echo "The data dump is empty" >&2; exit 1; }
[ -s "$work/dump/counts.csv" ] || { echo "The row counts are empty" >&2; exit 1; }

tar -cf - -C "$work/dump" . | age -r "$AGE_PUBLIC_KEY" -o "$work/$name"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
keys=("daily/$name")
[ "${date_utc:8:2}" = "01" ] && keys+=("monthly/$name")

local_size=$(stat -c%s "$work/$name")
for key in "${keys[@]}"; do
  aws s3 cp "$work/$name" "s3://$R2_BUCKET/$key" --endpoint-url "$endpoint"
  remote_size=$(aws s3api head-object --bucket "$R2_BUCKET" --key "$key" --query ContentLength --output text --endpoint-url "$endpoint")
  [ "$remote_size" = "$local_size" ] || { echo "Upload size mismatch for $key: local $local_size, remote $remote_size" >&2; exit 1; }
  echo "Uploaded $key ($local_size bytes)"
done

rm -rf "$work"
```

- [ ] **Step 4: Run, expect PASS** (`node --test scripts/backup.test.mjs`); then add the file to `test:e2e:runner` in `package.json` (`... scripts/create-shop.test.mjs scripts/backup.test.mjs`) and run `npm run test:e2e:runner`.
- [ ] **Step 5: Lint** the shell: `bash -n scripts/backup.sh`; `shellcheck scripts/backup.sh` if installed (not required).
- [ ] **Step 6: Commit** `feat(backup): nightly dump, encrypt and upload script with tests`

---

### Task 2: The workflow

**Files:**
- Create: `.github/workflows/backup.yml`
- Modify: `tests/unit/deploy-config.test.ts` (from plan 1)

- [ ] **Step 1: Write the failing test** (append to the workflows describe in `tests/unit/deploy-config.test.ts`)

```ts
  it("the backup runs nightly in its own environment, holds only backup credentials and never uploads an unencrypted artifact", () => {
    const backup = read(".github/workflows/backup.yml");

    expect(backup).toMatch(/cron: "0 5 \* \* \*"/);
    expect(backup).toContain("workflow_dispatch:");
    expect(backup).toContain("environment: backup");
    expect(backup).toContain("bash scripts/backup.sh");
    expect(backup).not.toContain("upload-artifact");
    for (const name of [...backup.matchAll(/\bsecrets\.([A-Z0-9_]+)/g)].map((match) => match[1])) {
      expect(["SUPABASE_DB_URL", "AGE_PUBLIC_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]).toContain(name);
    }
  });
```

- [ ] **Step 2: Run (FAIL); implement** `.github/workflows/backup.yml`:

```yaml
name: backup

on:
  schedule:
    - cron: "0 5 * * *" # 05:00 UTC = 02:00 in Brasília
  workflow_dispatch:

permissions:
  contents: read

jobs:
  backup:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: backup
    env:
      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
      AGE_PUBLIC_KEY: ${{ secrets.AGE_PUBLIC_KEY }}
      R2_ACCOUNT_ID: ${{ vars.R2_ACCOUNT_ID }}
      R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
      R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
      R2_BUCKET: ${{ vars.R2_BUCKET }}
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: 2.114.0
      - run: sudo apt-get update && sudo apt-get install -y age postgresql-client
      - run: bash scripts/backup.sh
```

The account ID and the bucket name are not secrets, so they are environment **variables**; the spec's list names them as `R2_ACCOUNT_ID` and `R2_BUCKET` in the `backup` environment either way. (Plan 1's docs test requires every name used to appear in `docs/hosted-deploy.md`: add them in Task 5.) If GitHub rejects `version: 2.114.0` for `setup-cli`, check the action's README for the current input name; the version must match `package.json`'s `supabase` range.

- [ ] **Step 3:** Test PASS; `npm run lint`. Commit `ci: nightly encrypted production backup`.

---

### Task 3: User setup, first run and the real `age` check (human steps)

- [ ] **Step 1 (user): R2.** Cloudflare > R2 > add the payment card (stay inside the 10 GB free tier), create bucket `zenc-backups` (no public access). Lifecycle rules (bucket > Settings > Object lifecycle rules): prefix `daily/` delete objects after **30** days; prefix `monthly/` delete after **366** days. API token: R2 > Manage API tokens > Create > **Object Read & Write**, scoped to the bucket `zenc-backups` only.
- [ ] **Step 2 (user): the key pair, on the user's own computer.**

```bash
age-keygen -o zenc-backup.key
```

It prints `Public key: age1...`. Store the **whole file** `zenc-backup.key` in the password manager and keep one offline copy (printed or on a USB stick in a drawer). Then delete the file from the computer (`shred -u zenc-backup.key`). The line starting `AGE-SECRET-KEY-` is the private key: it goes nowhere else.
- [ ] **Step 3 (user): GitHub environment `backup`** (no reviewer). Secrets: `SUPABASE_DB_URL` (zenc-prod > Connect > Session pooler, with the database password filled in; the direct host is IPv6 only and GitHub runners are IPv4), `AGE_PUBLIC_KEY` (the `age1...` line only), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Variables: `R2_ACCOUNT_ID`, `R2_BUCKET=zenc-backups`.
- [ ] **Step 4: First run.** Merge the PR, then Actions > backup > Run workflow. Expected log: three dumps, `Uploaded daily/zenc-prod-<date>.tar.age (N bytes)`. In the R2 dashboard the object exists. (Production has little data at this point; the first drill uses it anyway to prove the mechanics, the second one happens after the first business has real data.)
- [ ] **Step 5: Prove the encryption is real** (the unit test used a stub). The user downloads the object from the R2 dashboard and runs, in a scratch directory:

```bash
file zenc-prod-<date>.tar.age                      # must NOT say "tar archive": it is age-encrypted data
age -d -i zenc-backup.key zenc-prod-<date>.tar.age | tar -tf -    # lists roles.sql schema.sql data.sql counts.csv
```

with `zenc-backup.key` retrieved from the password manager just for this command and deleted afterwards. A wrong or missing key must fail (`age: error: no identity matched any of the file's recipients`).

---

### Task 4: The restore runbook and the first drill on `zenc-dev`

**Files:**
- Create: `docs/restore-runbook.md`

- [ ] **Step 1: Write the runbook** with exactly these sections (the user and a future Claude must be able to follow it half asleep):
  1. **When to use it** (production data lost or corrupted; the only recovery source is this backup: Supabase Free has no point-in-time recovery), and a warning: restoring replaces everything written since the dump.
  2. **What you need:** the private key from the password manager, `age`, `psql` (17), the Supabase CLI, access to R2 (dashboard download is enough), the target database's session-pooler URL.
  3. **Pick and decrypt** (commands from Task 3 Step 5 into `./restore/`); read `counts.csv`.
  4. **Real disaster path (target = a new Supabase project):** create the project (same region), point the `production` environment variables and secrets at it (`SUPABASE_PROJECT_REF`, URL, keys, DB password), run the deploy workflow so migrations, config, functions and Vault values are applied by the pipeline, then restore **data only** (next section). Update the `[remotes.prod] project_id` in `config.toml` by PR. Re-set the Supabase function secrets (they do not travel with a dump). DNS and the Worker need no change.
  5. **Data restore command** (target already has the schema):

```bash
psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -c "set session_replication_role = replica" \
  -f restore/data.sql
```

   `session_replication_role = replica` stops triggers (for example the profile created on every `auth.users` insert) from firing a second time while the rows come back.
  6. **Drill into `zenc-dev` (target already holds dev data):** first empty the data, never the schema:

```bash
psql "$DEV_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('truncate table public.%I restart identity cascade', r.tablename);
  end loop;
end $$;
truncate table auth.users cascade;
SQL
```

   then the data restore command above with `TARGET_DB_URL="$DEV_DB_URL"`. **Never run this block against production.** Check the host in `$DEV_DB_URL` contains the dev project ref before pressing enter.
  7. **Verify:** compare row counts of the restored database with `counts.csv` (same query as in `scripts/backup.sh`, run with `psql "$TARGET_DB_URL"`), sign in as a known user on the target's web address, open a business page, and check the cron job list (`select jobname, active from cron.job`).
  8. **Known gaps:** Storage files (avatars) are not in the dump, so profile pictures are missing after a restore until re-uploaded; function secrets and Vault values come from the pipeline and the user, not from the dump; roles other than the Supabase defaults are in `roles.sql` and applied only if custom roles are ever added.
  9. **Drill log** (table: date, dump used, source, target, minutes, result, problems found, fixes made to this runbook).
  10. **Weekly check (risk R7):** every Monday, open R2 > `zenc-backups` > `daily/`: the newest object is from the last 24 hours and its size is not zero. A failed run e-mails the user; a run that never happens does not.
- [ ] **Step 2: Drill #1 (user, with Claude guiding step by step).** Source: the dump from Task 3 (production, near-empty) or, if a business already exists on dev, a manual run of the workflow's script against dev (`BACKUP_DATE` set, a separate bucket prefix is not needed because dev is not production; do not point the workflow at dev). Follow the runbook literally against `zenc-dev`, timing each section. **Every deviation, error or missing command is fixed in the runbook immediately and logged in the drill table.**
- [ ] **Step 3: Pass criteria:** the restore finishes without errors; `counts.csv` equals the target's counts for every `public` table and `auth.users`; the dev owner can sign in on the dev site; the dev cron job list is intact; total time is recorded (it is the real recovery time).
- [ ] **Step 4: Drill #2** one week after the first real business goes live (spec open question 6), with production data in the dump. Same pass criteria; add the row to the log.
- [ ] **Step 5: Commit** `docs(backup): restore runbook and drill log`

---

### Task 5: Docs and gates

**Files:**
- Modify: `docs/hosted-deploy.md`

- [ ] **Step 1:** Add to the secrets matrix of `docs/hosted-deploy.md` the `backup` environment names exactly as used in `backup.yml` (`SUPABASE_DB_URL`, `AGE_PUBLIC_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) and a "Backups" section: what runs, where it lands, retention, the weekly check, the pointer to `docs/restore-runbook.md`, and the sentence "the private key lives only in the password manager". Update decision `019` (plan 2) with the backup choices.
- [ ] **Step 2: Gates** (Global Constraints). Commit `docs(deploy): backups are live`.

---

## Self-review

- Spec coverage: 4.6 (Tasks 1 and 2: three dumps, counts, tar, age, R2 daily and monthly, sanity checks, own environment), retention by R2 lifecycle (Task 3), failure e-mails from GitHub plus the weekly check (Task 4 section 10), runbook proven on `zenc-dev` (Task 4), user items C13 to C17 (Task 3), R7 (weekly check), R9 (Task 0 spike and the drill), the storage-files gap (new R10, Task 0 Step 3 and runbook section 8).
- Placeholders: `<date>` in object names, `$DEV_DB_URL` and `$TARGET_DB_URL` are typed by the user in their own shell.
- Consistency: object keys `daily/` and `monthly/` and the file names inside the archive (`roles.sql`, `schema.sql`, `data.sql`, `counts.csv`) are the same in the script, the tests, the lifecycle rules and the runbook; environment name `backup` and variable names match the spec matrix.
