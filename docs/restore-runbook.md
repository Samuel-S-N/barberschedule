# Restore runbook (production database)

Source of truth for recovering `zenc-prod` from the nightly backup (`scripts/backup.sh`, workflow `backup.yml`). Supabase Free has no
point-in-time recovery, so this backup is the only recovery source. **A restore brings back the state of the dump: everything written
after it is lost.** Design: `docs/superpowers/specs/2026-11-26-deploy-05-design.md` (4.6).

## 1. What you need

- The **age private key** (`zenc-backup.key`) from the owner's password manager. It lives nowhere else; without it the archives are unreadable.
- `age`, `psql` 17 and the Supabase CLI on your computer. (Debian/Ubuntu: `sudo apt install age postgresql-client`.)
- Read access to the bucket `zenc-backups` in Cloudflare R2 (the dashboard "Download" button is enough: no extra token).
- The session-pooler connection string of the **target** database (Supabase > Connect > Session pooler, password filled in, special
  characters percent-encoded), typed only into your own shell.

## 2. Pick and decrypt a dump

1. R2 > `zenc-backups` > `daily/zenc-prod-<date>.tar.age` (or `monthly/`). Download it into an empty folder.
2. Decrypt and unpack (retrieve the key just for this command and delete it afterwards):

   ```bash
   mkdir restore && age -d -i zenc-backup.key zenc-prod-<date>.tar.age | tar -xf - -C restore
   ls restore        # roles.sql schema.sql data.sql counts.csv
   column -s, -t restore/counts.csv
   ```

   `counts.csv` lists the rows per `public` table and in `auth.users` at the moment of the dump: it is the yardstick for step 5.

## 3. Real disaster: the target is a NEW Supabase project

1. Create the project (same region, `sa-east-1`) in the "Zenc" organization.
2. Point the `production` GitHub environment at it: variables `SUPABASE_PROJECT_REF`, `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; secret `SUPABASE_DB_PASSWORD`. Replace `[remotes.prod] project_id` in `supabase/config.toml`
   by a pull request.
3. Set the Supabase **function secrets** of the new project again (`docs/hosted-deploy.md` section 0c, the `zenc-prod` column): they do
   not travel in a dump.
4. Run the `deploy` workflow and approve `production`: migrations, auth config, functions, Vault values and the web bundle are applied by
   the pipeline. DNS and the Worker need no change.
5. Restore the **data only** (the schema now exists):

   ```bash
   psql "$TARGET_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
     -c "set session_replication_role = replica" \
     -f restore/data.sql
   ```

   `session_replication_role = replica` stops triggers (for example the profile created on every `auth.users` insert) from firing a
   second time while the rows come back.

## 4. Drill: the target is `zenc-dev` (it already holds data)

Only against **zenc-dev**. Check that `$DEV_DB_URL` contains the dev project ref before pressing enter; never run this block against production.

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

Then the data restore command of section 3 step 5 with `TARGET_DB_URL="$DEV_DB_URL"`. The schema is left alone: this proves the data
path, which is also the real disaster path (the schema comes from the pipeline).

## 5. Verify

1. Row counts: run the same query as `scripts/backup.sh` against the target and compare with `restore/counts.csv` (every `public`
   table and `auth.users` must match):

   ```bash
   psql "$TARGET_DB_URL" -At -F, -c "select table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_type = 'BASE TABLE' and (table_schema = 'public' or (table_schema = 'auth' and table_name = 'users')) order by 1" | diff - restore/counts.csv && echo "counts match"
   ```

2. Sign in as a known user on the target's web address, and open a business page.
3. `select jobname, active from cron.job order by jobname;` lists the four jobs, and `select name from vault.decrypted_secrets order by name;`
   lists `dispatch_token` and `dispatch_url` (from the pipeline).
4. Delete `restore/` (`shred -u restore/*; rmdir restore`) and the downloaded archive: the dump holds personal data.

## 6. Known gaps

- **Storage files (avatars) are not in the dump.** `storage.objects` rows come back, the files do not: profile pictures are missing
  until re-uploaded. Accepted for 0.5.
- Function secrets and Vault values come from the owner and the pipeline, not from the dump.
- `roles.sql` is kept for completeness; apply it only if custom roles are ever added (today the Supabase defaults are enough).

## 7. Weekly check (a backup that never runs sends no alert)

Every Monday, R2 > `zenc-backups` > `daily/`: the newest object is from the last 24 hours and is not empty. GitHub e-mails a failed
scheduled run, but nothing e-mails a run that never started.

## 8. Drill log

| Date | Dump used | Source | Target | Minutes | Result | Problems found / runbook fixes |
|---|---|---|---|---|---|---|
| (drill 1: after the first backup, into `zenc-dev`) | | | | | | |
| (drill 2: one week after the first real business goes live) | | | | | | |
