#!/usr/bin/env bash
# Prints the IP the PHONE should use, from the Wi-Fi interface that is connected RIGHT NOW (client or hotspot).
# The default route is not used first: with a cable plugged in it points at the cable, not at the phone's network.
# Override: NET_IP=1.2.3.4. Network name/interface go to stderr so stdout stays a bare IP.
if [ -n "$NET_IP" ]; then echo "$NET_IP"; exit 0; fi
dev=$(nmcli -t -f DEVICE,TYPE,STATE dev 2>/dev/null | awk -F: '$2=="wifi" && $3=="connected"{print $1; exit}')
ip=""
if [ -n "$dev" ]; then
  ip=$(ip -4 -o addr show dev "$dev" | awk '{print $4}' | cut -d/ -f1 | head -1)
  name=$(nmcli -t -f NAME,DEVICE con show --active 2>/dev/null | awk -F: -v d="$dev" '$2==d{print $1; exit}')
  echo "network: ${name:-?} ($dev) $ip" >&2
fi
if [ -z "$ip" ]; then
  ip=$(ip -4 route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+')
  echo "network: no Wi-Fi connected, falling back to default route -> $ip (phone may not reach this)" >&2
fi
[ -n "$ip" ] && echo "$ip" || { echo "no network found" >&2; exit 1; }
