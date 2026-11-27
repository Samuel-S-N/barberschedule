import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { logoSiteForProject, setEmailLogo } from "./set-email-logo.mjs";

const CONFIG = `[auth]
site_url = "http://127.0.0.1:3000"

[remotes.dev]
project_id = "aaaaaaaaaaaaaaaaaaaa"

[remotes.dev.auth]
site_url = "https://zenc-web-dev.zenc.workers.dev"

[remotes.prod]
project_id = "bbbbbbbbbbbbbbbbbbbb"

[remotes.prod.auth]
site_url = "https://zencpro.app"
`;
const LOGO = '<img src="https://zencpro.app/email/zenc-logo.png" width="119">';

test("finds the site of the remote whose project id matches", () => {
  assert.equal(logoSiteForProject(CONFIG, "aaaaaaaaaaaaaaaaaaaa"), "https://zenc-web-dev.zenc.workers.dev");
  assert.equal(logoSiteForProject(CONFIG, "bbbbbbbbbbbbbbbbbbbb"), "https://zencpro.app");
  assert.throws(() => logoSiteForProject(CONFIG, "cccccccccccccccccccc"), /No \[remotes\.\*\] block/);
});

function templates() {
  const dir = mkdtempSync(join(tmpdir(), "logo-"));

  mkdirSync(join(dir, "templates"));
  writeFileSync(join(dir, "templates", "confirmation.html"), `<p>${LOGO}</p>`);
  writeFileSync(join(dir, "templates", "invite.html"), `<p>${LOGO}</p><a href="{{ .ConfirmationURL }}">x</a>`);

  return join(dir, "templates");
}

test("dev: every template's logo follows the dev site", () => {
  const dir = templates();

  assert.equal(setEmailLogo(dir, "https://zenc-web-dev.zenc.workers.dev"), 2);
  for (const name of ["confirmation", "invite"]) {
    const html = readFileSync(join(dir, `${name}.html`), "utf8");

    assert.match(html, /src="https:\/\/zenc-web-dev\.zenc\.workers\.dev\/email\/zenc-logo\.png"/);
    assert.doesNotMatch(html, /zencpro\.app/);
  }
  assert.match(readFileSync(join(dir, "invite.html"), "utf8"), /\{\{ \.ConfirmationURL \}\}/);
});

test("production: the site is zencpro.app, so the templates stay exactly as they are", () => {
  const dir = templates();
  const before = readFileSync(join(dir, "confirmation.html"), "utf8");

  setEmailLogo(dir, logoSiteForProject(CONFIG, "bbbbbbbbbbbbbbbbbbbb"));
  assert.equal(readFileSync(join(dir, "confirmation.html"), "utf8"), before);
});

test("rejects a site that is not an https origin", () => {
  assert.throws(() => setEmailLogo(templates(), "http://127.0.0.1:3000"), /https/);
  assert.throws(() => setEmailLogo(templates(), "not a url"), /https/);
});
