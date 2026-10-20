---
name: running-barberschedule-tunnels
description: Use when the phone is on a different network than the notebook (4G, another Wi-Fi), when the LAN/hotspot setup of running-barberschedule-locally cannot be used, or when the user asks for a tunnel / ngrok / cloudflare to open the app from anywhere
---

# Running barberschedule through Cloudflare tunnels

## Overview

Phone reaches the app from any network through two free Cloudflare quick tunnels (no account): **Supabase** (`:55421`) and **Metro** (`:8081`). Both are needed: the app calls Supabase straight from the phone. Prerequisites (code synced, deps, Supabase up and migrated, test user) are steps 1-3 and 5 of `running-barberschedule-locally`. **Do not report "running" until `tunnels.sh check` prints `ALL CHECKS PASSED`.**

## Procedure

Run from the repo root. Script: `.claude/skills/running-barberschedule-tunnels/tunnels.sh`.

0. **Check the current network first.** `.claude/skills/running-barberschedule-locally/lan-ip.sh` prints the connected Wi-Fi (name, interface, IP) on stderr. Tunnel URLs and `.env.local` from an earlier network or session are **stale**: never reuse them, always run `start` fresh (it kills old cloudflared and Metro). The notebook still needs internet (cable or Wi-Fi) for cloudflared.
1. **cloudflared.** Needs `~/.local/bin/cloudflared`. If missing, **ask the user first** (downloads a ~40 MB binary): `curl -fsSL -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/.local/bin/cloudflared`.
2. **Start.** `tunnels.sh start`: kills old tunnels/Metro, opens both tunnels, writes the Supabase tunnel URL into `.env.local`, starts Metro with `EXPO_PACKAGER_PROXY_URL=<metro tunnel>` and `--clear`. Prints the URLs.
3. **Check.** `tunnels.sh check` (iOS bundle compile can take a few minutes). Fix with the `->` hint, rerun until 0 failures.
4. **QR.** `node .claude/skills/running-barberschedule-locally/qr.mjs exps://<metro-host>` (host from step 2, without `https://`). Render the SVG with `show_widget` (call `read_me` first if this session has not). Also give the `exps://` URL for manual entry in Expo Go. **`exps://` with the s**: tunnel is HTTPS, `exp://` fails.
5. **Stop.** `tunnels.sh stop` kills the tunnels and returns `.env.local` and Metro to the current Wi-Fi IP, then run `running-barberschedule-locally/validate.sh --fast`.

## Common mistakes

- **Reusing a QR/URL after reconnecting, a reboot, or restarting a tunnel.** `trycloudflare.com` URLs change every start. Rerun `start`, `check`, regenerate the QR.
- **Starting Metro without `EXPO_PACKAGER_PROXY_URL`.** The manifest then points at the LAN IP and the phone loads nothing; `check` catches it.
- **`.env.local` still on the LAN IP.** Login fails only on the phone; `check` catches it.
- **Auto mode blocks the tunnel** ("External Ingress Tunnel"). The user must allow it, e.g. `Bash(~/.local/bin/cloudflared tunnel *)` in `.claude/settings.local.json` (valid JSON: watch commas). The rule matches direct cloudflared commands; if the script is blocked, ask the user to allow `Bash(.claude/skills/running-barberschedule-tunnels/tunnels.sh *)` too. Never work around a denial.
- **Security.** While the Supabase tunnel is open, the local dev database is reachable from the internet to anyone with the URL and the publishable key. Say so, keep it short-lived, no real data, and offer `stop`.
- Expo Go asking for an Expo login is the app's own screen; skip it and open by URL.

## Red flags — stop and rerun check

- "The tunnel URL from earlier should still work"
- "Metro is up, so it works" (check the manifest and bundle through the tunnel)
