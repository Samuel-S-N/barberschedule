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
