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
