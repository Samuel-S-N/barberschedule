// Prints the Expo Go QR for the running Metro. Expo only prints its own QR in an interactive TTY.
// Run from repo root: node .claude/skills/running-barberschedule-locally/qr.mjs
// Prints a ready-to-render SVG (black on white, 4-module quiet zone) followed by the exp:// URL.
// Show the SVG with show_widget. Do NOT paste block-character text: phone cameras cannot scan it.
import { execSync } from 'node:child_process';
import { toQR } from 'toqr';

const ip = execSync('ip -4 route get 1.1.1.1').toString().match(/src (\S+)/)[1];
const url = `exp://${ip}:8081`;
const d = toQR(url), n = Math.sqrt(d.length);
let p = '';
for (let i = 0; i < d.length; i++) if (d[i]) p += `M${i % n} ${Math.floor(i / n)}h1v1h-1z`;
const v = n + 8;
console.log(`<div style="text-align:center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${v} ${v}" width="330" height="330" style="max-width:100%;height:auto"><rect x="-4" y="-4" width="${v}" height="${v}" fill="#fff"/><path fill="#000" shape-rendering="crispEdges" d="${p}"/></svg><div style="font-family:monospace;margin-top:8px">${url}</div></div>`);
console.error(url);
