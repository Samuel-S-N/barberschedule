#!/usr/bin/env bash
# Validates a running barberschedule dev environment. Exit code = number of failed checks.
# Usage: validate.sh [--fast]   (--fast skips typecheck/lint/jest)
cd "$(git rev-parse --show-toplevel)" || exit 99
TEST_EMAIL=${TEST_EMAIL:-samuel@teste.com}; TEST_PASSWORD=${TEST_PASSWORD:-samu1234}
fail=0
ok()  { echo "PASS  $1"; }
bad() { echo "FAIL  $1  -> $2"; fail=$((fail+1)); }
chk() { local name=$1 fix=$2; shift 2; if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name" "$fix"; fi; }

LAN_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
ENV_URL=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env.local 2>/dev/null | cut -d= -f2-)
KEY=$(grep '^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.local 2>/dev/null | cut -d= -f2-)
DB=$(docker ps --format '{{.Names}}' 2>/dev/null | grep '^supabase_db')

# 1. Code is current (a stale checkout served the OLD UI once)
git fetch origin -q 2>/dev/null
behind=$(git rev-list --count HEAD..origin/main 2>/dev/null)
[ "$behind" = 0 ] && ok "checkout up to date with origin/main" || bad "checkout behind origin/main by ${behind:-?}" "git stash; git merge --ff-only origin/main; git stash pop"
chk "node_modules matches package-lock" "npm install" npm ls --depth=0

# 2. Env file points at the LAN IP, not loopback (phone cannot reach 127.0.0.1)
[ -n "$LAN_IP" ] && ok "LAN IP detected: $LAN_IP" || bad "no LAN IP" "connect to Wi-Fi"
case "$ENV_URL" in
  "http://$LAN_IP:"*) ok "EXPO_PUBLIC_SUPABASE_URL uses LAN IP" ;;
  *) bad "EXPO_PUBLIC_SUPABASE_URL=$ENV_URL is not http://$LAN_IP:55421" "edit .env.local, then restart Metro with --clear" ;;
esac
[ -n "$KEY" ] && [ "$KEY" != "your-publishable-key" ] && ok "publishable key set" || bad "publishable key missing/placeholder" "copy PUBLISHABLE_KEY from: npx supabase status -o env"

# 3. Supabase local
chk "docker daemon up" "start docker" docker ps
[ -n "$DB" ] && ok "supabase db container running" || bad "supabase not running" "npx supabase start"
chk "auth API healthy on LAN" "check supabase + firewall" curl -sf -m 4 "http://$LAN_IP:55421/auth/v1/health" -H "apikey: $KEY"
files=$(ls supabase/migrations/*.sql | wc -l)
applied=$(docker exec "$DB" psql -U postgres -tAc "select count(*) from supabase_migrations.schema_migrations" 2>/dev/null)
[ "$files" = "$applied" ] && ok "all $files migrations applied" || bad "migrations: $applied applied of $files" "npx supabase migration up   (NOT db reset: it deletes the test user)"

# 4. Test user can log in
code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST "http://$LAN_IP:55421/auth/v1/token?grant_type=password" \
  -H "apikey: $KEY" -H 'Content-Type: application/json' -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")
[ "$code" = 200 ] && ok "test user logs in" || bad "login returned $code" "signup: POST /auth/v1/signup with same body"

# 5. Static checks
if [ "$1" != "--fast" ]; then
  chk "typecheck" "fix type errors" npm run -s typecheck
  chk "lint" "fix lint errors" npm run -s lint
  chk "jest" "see: npm test -- --runInBand" npm test -- --runInBand --silent
fi

# 6. Metro
[ "$(curl -s -m 3 localhost:8081/status)" = "packager-status:running" ] && ok "Metro running on :8081" || bad "Metro not running" "setsid nohup npx expo start --lan --clear >log 2>&1 </dev/null &"
if ps -o args= -p "$(ss -ltnp 2>/dev/null | grep ':8081' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)" 2>/dev/null | grep -q .; then
  tr '\0' ' ' < /proc/$(ss -ltnp | grep ':8081' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)/environ 2>/dev/null | grep -q 'CI=1' && bad "Metro started with CI=1 (no hot reload)" "restart without CI=1" || ok "Metro has hot reload (no CI=1)"
fi
code=$(curl -s -m 240 -o /dev/null -w '%{http_code}' "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true")
[ "$code" = 200 ] && ok "Android bundle compiles" || bad "bundle returned $code" "read Metro log for the error"

echo; [ $fail = 0 ] && echo "ALL CHECKS PASSED" || echo "$fail CHECK(S) FAILED"
exit $fail
