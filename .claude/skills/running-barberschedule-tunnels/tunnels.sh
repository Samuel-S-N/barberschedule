#!/usr/bin/env bash
# Cloudflare quick tunnels for Supabase (:55421) and Metro (:8081), so any network (4G included) can run the app.
# Usage: tunnels.sh start | check | stop      Run from anywhere; operates on the repo root.
cd "$(git rev-parse --show-toplevel)" || exit 99
CF=${CF:-$HOME/.local/bin/cloudflared}
LAN="$PWD/.claude/skills/running-barberschedule-locally/lan-ip.sh"
url() { grep -ho 'https://[a-z0-9-]*\.trycloudflare\.com' "$1" 2>/dev/null | head -1; }
kill_port() { local p; p=$(ss -ltnp | grep ":$1 " | grep -o 'pid=[0-9]*' | cut -d= -f2); [ -n "$p" ] && kill $p; }
setenv() { sed -i "s#^EXPO_PUBLIC_SUPABASE_URL=.*#EXPO_PUBLIC_SUPABASE_URL=$1#" .env.local; }

case "$1" in
start)
  [ -x "$CF" ] || { echo "cloudflared missing at $CF: ask the user before downloading (see SKILL.md)"; exit 2; }
  # Stale tunnels/Metro from a previous network or session must not survive: their URLs are dead or point nowhere.
  pkill -x cloudflared; kill_port 8081; sleep 1
  for n in sb:55421 mt:8081; do setsid nohup "$CF" tunnel --url "http://localhost:${n#*:}" > "/tmp/cf-${n%%:*}.log" 2>&1 < /dev/null & done
  for _ in $(seq 30); do SB=$(url /tmp/cf-sb.log); MT=$(url /tmp/cf-mt.log); [ -n "$SB" ] && [ -n "$MT" ] && break; sleep 1; done
  [ -n "$SB" ] && [ -n "$MT" ] || { echo "tunnel URLs not ready, see /tmp/cf-*.log"; exit 1; }
  setenv "$SB"
  EXPO_PACKAGER_PROXY_URL=$MT setsid nohup npx expo start --lan --clear > /tmp/expo.log 2>&1 < /dev/null &
  echo "supabase: $SB"; echo "metro:    $MT"; echo "qr url:   exps://${MT#https://}"
  echo "next: run '$0 check', then render the QR (see SKILL.md)" ;;
check)
  fail=0; bad() { echo "FAIL  $1  -> $2"; fail=$((fail+1)); }; ok() { echo "PASS  $1"; }
  SB=$(url /tmp/cf-sb.log); MT=$(url /tmp/cf-mt.log)
  pgrep -x cloudflared >/dev/null && [ -n "$SB" ] && [ -n "$MT" ] && ok "cloudflared running, URLs found" || bad "tunnels not running" "$0 start"
  KEY=$(grep '^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' .env.local | cut -d= -f2-)
  ENV=$(grep '^EXPO_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
  [ "$ENV" = "$SB" ] && ok ".env.local = current Supabase tunnel" || bad ".env.local=$ENV is not $SB (old tunnel/LAN)" "$0 start"
  [ "$(curl -s -m 8 -o /dev/null -w '%{http_code}' -H "apikey: $KEY" "$SB/auth/v1/health")" = 200 ] && ok "Supabase reachable through tunnel" || bad "Supabase tunnel dead" "$0 start"
  [ "$(curl -s -m 8 "$MT/status")" = "packager-status:running" ] && ok "Metro reachable through tunnel" || bad "Metro tunnel dead or Metro down" "$0 start"
  curl -s -m 20 -H 'expo-platform: ios' -H 'Accept: application/expo+json' "$MT/" | grep -q "$MT" && ok "Metro manifest points at the tunnel" || bad "manifest does not use the tunnel (Metro started without EXPO_PACKAGER_PROXY_URL)" "$0 start"
  [ "$(curl -s -m 240 -o /dev/null -w '%{http_code}' "$MT/node_modules/expo-router/entry.bundle?platform=ios&dev=true")" = 200 ] && ok "iOS bundle compiles" || bad "bundle failed" "read /tmp/expo.log"
  echo; [ $fail = 0 ] && echo "ALL CHECKS PASSED" || echo "$fail CHECK(S) FAILED"; exit $fail ;;
stop)
  pkill -x cloudflared; kill_port 8081
  IP=$("$LAN") || exit 1
  setenv "http://$IP:55421"
  REACT_NATIVE_PACKAGER_HOSTNAME=$IP setsid nohup npx expo start --lan --clear > /tmp/expo.log 2>&1 < /dev/null &
  echo "back on LAN $IP: run running-barberschedule-locally/validate.sh --fast" ;;
*) echo "usage: $0 start|check|stop"; exit 64 ;;
esac
