// Renders the e-mail logo: the ZENC. wordmark of the app (Oswald Bold, ink, the period drawn as a wine circle on the baseline; ADR 017,
// same proportions as src/components/domain/Wordmark.tsx) as a transparent PNG at 2x, to public/email/zenc-logo.png.
// The web export copies public/ as it is, so https://zencpro.app/email/zenc-logo.png serves it. Usage: node scripts/render-email-logo.mjs
// (needs Playwright and Chrome, like the e2e suite). Display size in the e-mails: LOGO_WIDTH x LOGO_HEIGHT (half the PNG).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const font = pathToFileURL(join(root, "node_modules/@expo-google-fonts/oswald/700Bold/Oswald_700Bold.ttf")).href;
const INK = "#171412";
const WINE = "#7A1F2B";
// Same ratios as the in-app Wordmark: letter spacing 6%, dot 18% of the size, 14% above the baseline, 5% from the C.
const SIZE = 48;
const html = `<!doctype html><html><head><style>
@font-face { font-family: "Oswald Bold"; src: url("${font}"); }
html, body { margin: 0; background: transparent; }
#mark { display: inline-flex; align-items: flex-end; padding: 0; }
#text { font-family: "Oswald Bold"; font-size: ${SIZE}px; line-height: 1; letter-spacing: ${SIZE * 0.06}px; color: ${INK}; margin-right: -${SIZE * 0.06}px; }
#dot { width: ${SIZE * 0.18}px; height: ${SIZE * 0.18}px; border-radius: 50%; background: ${WINE}; margin-bottom: ${SIZE * 0.14}px; margin-left: ${SIZE * 0.05 + SIZE * 0.06}px; }
</style></head><body><div id="mark"><span id="text">ZENC</span><span id="dot"></span></div></body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2 });

// A real file: a page built with setContent cannot load the local font file.
const file = join(mkdtempSync(join(tmpdir(), "zenc-logo-")), "logo.html");

writeFileSync(file, html);
await page.goto(pathToFileURL(file).href);
await page.evaluate(() => document.fonts.ready);
const box = await page.locator("#mark").boundingBox();
const png = await page.locator("#mark").screenshot({ omitBackground: true });

mkdirSync(join(root, "public/email"), { recursive: true });
writeFileSync(join(root, "public/email/zenc-logo.png"), png);
console.log(`public/email/zenc-logo.png written; display size at 1x: ${Math.round(box.width)}x${Math.round(box.height)}`);
await browser.close();
