---
name: running-barberschedule-locally
description: Use when starting the barberschedule app for the first time or after a break, when Expo Go shows the old UI, login fails from the phone, Supabase is not running, migrations are missing, or a QR code for Expo Go is needed
---

# Running barberschedule locally

## Overview

Expo (Metro) app + local Supabase in Docker. Phone runs it through Expo Go over Wi-Fi. **Every step has a check; `validate.sh` runs them all. Do not report "running" until it prints `ALL CHECKS PASSED`.**

## Procedure

Run from the repo root. Each step names the failure it prevents.

1. **Sync code.** `git fetch origin`, then `git rev-list --count HEAD..origin/main` must be `0`. If not: `git stash && git merge --ff-only origin/main && git stash pop`. *(A checkout 43 commits behind served the old UI.)*
2. **Deps.** `npm install` (package.json changes with merges).
3. **Supabase.** Docker must be up. Not running → `npx supabase start`. Already running with new migrations → `npx supabase migration up`. **Never `db reset` unless the test user may be lost.**
4. **`.env.local`.** `EXPO_PUBLIC_SUPABASE_URL` must be `http://<LAN-IP>:55421`, never `127.0.0.1` (the phone would call itself). LAN IP: `ip -4 route get 1.1.1.1`. Key: `npx supabase status -o env` → `PUBLISHABLE_KEY`.
5. **Test user** (local only). `POST <url>/auth/v1/signup` with `{"email","password"}` and header `apikey: <publishable key>`. Email confirmation is off; a trigger creates a `customer` profile. Owner screens need `role='owner'` in `public.profiles`.
6. **Metro.** Start detached, **without `CI=1`** (CI mode disables hot reload):
   `setsid nohup npx expo start --lan --clear > /tmp/expo.log 2>&1 < /dev/null &`
   Restart after any `.env.local` change, with `--clear`.
7. **QR.** Expo prints none without a TTY. `node .claude/skills/running-barberschedule-locally/qr.mjs` prints an SVG (stdout) and the URL (stderr). Pass the SVG to `show_widget` as the widget code (add `read_me` first if this session has not). **Never paste block-character QR text in chat: Expo Go could not scan it.** Also give the `exp://<LAN-IP>:8081` URL for manual entry. Phone must be on the same Wi-Fi.
8. **Validate.** `.claude/skills/running-barberschedule-locally/validate.sh` (`--fast` skips typecheck/lint/jest). Exit code = number of failures. Fix using the `->` hint on each FAIL line, rerun until 0.

## What validate.sh proves

| Check | Failure it catches |
|---|---|
| up to date with origin/main | old UI |
| env URL = LAN IP | login fails only on phone |
| supabase container + LAN health | Supabase down / unreachable |
| migrations applied = files | missing tables/functions (e.g. new signups can't book) |
| test user login = 200 | user missing / wrong DB |
| typecheck, lint, jest | broken checkout |
| Metro `packager-status:running`, no `CI=1` | server down / no hot reload |
| Android bundle = 200 | compile error in app code |

Not covered: what the screens look like. Confirm the UI on the device, or in a browser with a screenshot.

## Common mistakes

- **`pkill -f "expo start"`** matches your own shell command and kills it (exit 144). Kill by port instead: `kill $(ss -ltnp | grep :8081 | grep -o 'pid=[0-9]*' | cut -d= -f2)`.
- **LAN IP is DHCP.** After reconnecting to Wi-Fi it may change: rerun step 4, restart Metro, regenerate the QR.
- **Claiming success from `curl /status` alone.** It is up before the bundle compiles; the bundle check is what catches app errors.
- `docker exec` and `supabase start` may need the sandbox disabled; the daemon socket is outside it.

## Red flags — stop and rerun validate.sh

- "Metro is up, so it works"
- "The env file looks right" (not restarted with `--clear`)
- "UI looks old, must be cache" (check step 1 first)
