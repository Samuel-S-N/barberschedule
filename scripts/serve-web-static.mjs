// Serves the static web export (`expo export --platform web`) for the local Playwright suite.
// Why: the Metro dev server leaks memory with every page load and dies with a heap OOM after ~180 e2e tests;
// a prebuilt bundle served as files does not. Usage: node scripts/serve-web-static.mjs <dir> <port>
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import process from "node:process";

const [root = "dist", portArg = "4173"] = process.argv.slice(2);
const TYPES = { ".css": "text/css", ".html": "text/html; charset=utf-8", ".ico": "image/x-icon", ".js": "text/javascript", ".json": "application/json", ".map": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2" };

const isFile = (path) => existsSync(path) && statSync(path).isFile();

// `/clients/123` -> `clients/[id].html`: match a dynamic segment file in each directory along the path.
function resolveDynamic(segments) {
  let dir = root;

  for (let index = 0; index < segments.length; index += 1) {
    const last = index === segments.length - 1;
    const exact = join(dir, segments[index]);

    if (!last && existsSync(exact) && statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }
    if (last && isFile(`${exact}.html`)) return `${exact}.html`;
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    const dynamicFile = entries.find((name) => /^\[.+\]\.html$/.test(name));
    const dynamicDir = entries.find((name) => /^\[.+\]$/.test(name) && statSync(join(dir, name)).isDirectory());

    if (last && dynamicFile) return join(dir, dynamicFile);
    if (!last && dynamicDir) {
      dir = join(dir, dynamicDir);
      continue;
    }

    return null;
  }

  return null;
}

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const direct = join(root, clean);

  if (isFile(direct)) return direct;
  if (isFile(`${direct}.html`)) return `${direct}.html`;
  if (isFile(join(direct, "index.html"))) return join(direct, "index.html");

  return resolveDynamic(clean.split("/").filter(Boolean)) ?? join(root, "index.html");
}

createServer((request, response) => {
  const file = resolvePath(request.url ?? "/");

  response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}).listen(Number(portArg), "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${portArg}`));
