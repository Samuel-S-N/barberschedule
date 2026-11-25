import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs, run } from "./create-shop.mjs";

const env = { SHOP_URL_TEMPLATE: "https://{slug}.zencpro.app", SUPABASE_SERVICE_ROLE_KEY: "service-key", SUPABASE_URL: "https://x.supabase.co" };
const argv = ["--name", "Barbearia do João", "--slug", "barbeariadojoao", "--owner", "joao@email.com"];

function fakeFetch(handlers) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ body: init.body ? JSON.parse(init.body) : null, method: init.method ?? "GET", url: String(url) });
    for (const [match, respond] of handlers) if (String(url).includes(match) && (!respond.method || respond.method === (init.method ?? "GET"))) return respond.reply();
    throw new Error(`unexpected request ${url}`);
  };

  return { calls, fn };
}
const noShop = ["/rest/v1/shops", { reply: () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }) }];
const reply = (status, body) => ({ reply: () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }) });
const logger = () => { const lines = []; return { lines, log: (line) => lines.push(line) }; };

test("parseArgs reads the three flags and the optional timezone", () => {
  assert.deepEqual(parseArgs([...argv, "--timezone", "America/Manaus"]), { name: "Barbearia do João", owner: "joao@email.com", slug: "barbeariadojoao", timezone: "America/Manaus" });
});

test("parseArgs refuses a missing flag and a bad slug before any request", () => {
  assert.throws(() => parseArgs(["--name", "X"]), /--slug/);
  assert.throws(() => parseArgs(["--name", "X", "--slug", "WWW", "--owner", "a@b.co"]), /slug/i);
  assert.throws(() => parseArgs(["--name", "X", "--slug", "www", "--owner", "a@b.co"]), /reserved/i);
});

test("invites the owner with the shop link, creates the shop and prints the link", async () => {
  const { calls, fn } = fakeFetch([
    noShop,
    ["/auth/v1/invite", reply(200, { id: "user-1" })],
    ["/rest/v1/rpc/create_shop", reply(200, { slug: "barbeariadojoao" })],
  ]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 0);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/rest\/v1\/shops\?slug=eq\.barbeariadojoao/);
  assert.match(calls[1].url, /\/auth\/v1\/invite\?redirect_to=https%3A%2F%2Fbarbeariadojoao\.zencpro\.app%2Freset-password$/);
  assert.deepEqual(calls[1].body, { email: "joao@email.com" });
  assert.deepEqual(calls[2].body, { p_name: "Barbearia do João", p_owner_user_id: "user-1", p_slug: "barbeariadojoao", p_timezone: "America/Sao_Paulo" });
  assert.ok(out.lines.some((line) => line.includes("https://barbeariadojoao.zencpro.app")));
  assert.ok(out.lines.some((line) => /QR/i.test(line)));
  assert.ok(out.lines.some((line) => /setup checklist/i.test(line) && line.includes("https://barbeariadojoao.zencpro.app")));
});

test("an existing account stops before create_shop", async () => {
  const { calls, fn } = fakeFetch([noShop, ["/auth/v1/invite", reply(422, { error_code: "email_exists" })]]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 1);
  assert.equal(calls.length, 2);
  assert.ok(out.lines.some((line) => /already has an account/i.test(line)));
});

test("a failed create_shop deletes the invited user", async () => {
  const { calls, fn } = fakeFetch([
    noShop,
    ["/auth/v1/invite", reply(200, { id: "user-1" })],
    ["/rest/v1/rpc/create_shop", reply(400, { code: "P0041", message: "SHOP_SLUG_INVALID" })],
    ["/auth/v1/admin/users/user-1", reply(200, {})],
  ]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 1);
  assert.equal(calls[3].method, "DELETE");
  assert.ok(out.lines.some((line) => /slug/i.test(line)));
});

test("missing environment variables are reported", async () => {
  const out = logger();

  assert.equal(await run({ argv, env: {}, fetch: async () => { throw new Error("no request expected"); }, log: out.log }), 1);
  assert.ok(out.lines.some((line) => line.includes("SUPABASE_URL")));
});

test("a slug that is already taken is caught before any invite e-mail is sent", async () => {
  const { calls, fn } = fakeFetch([["/rest/v1/shops", reply(200, [{ id: "s1" }])]]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 1);
  assert.equal(calls.length, 1);
  assert.ok(out.lines.some((line) => /slug/i.test(line) && /taken/i.test(line)));
});

test("a 422 that is not email_exists is not reported as an existing account", async () => {
  const { fn } = fakeFetch([noShop, ["/auth/v1/invite", reply(422, { error_code: "validation_failed" })]]);
  const out = logger();

  assert.equal(await run({ argv, env, fetch: fn, log: out.log }), 1);
  assert.ok(!out.lines.some((line) => /already has an account/i.test(line)));
});

test("an invalid timezone is refused before any request", async () => {
  const out = logger();

  assert.equal(await run({ argv: [...argv, "--timezone", "Mars/Olympus"], env, fetch: async () => { throw new Error("no request expected"); }, log: out.log }), 1);
  assert.ok(out.lines.some((line) => /timezone/i.test(line)));
});

test("if create_shop cannot be reached the invite is undone, and a failed undo is reported as an orphan", async () => {
  const handlers = [noShop, ["/auth/v1/invite", reply(200, { id: "user-1" })], ["/auth/v1/admin/users/user-1", reply(500, {})]];
  const { fn } = fakeFetch(handlers);
  const failing = async (url, init) => {
    if (String(url).includes("/rpc/create_shop")) throw new TypeError("network down");

    return fn(url, init);
  };
  const out = logger();

  assert.equal(await run({ argv, env, fetch: failing, log: out.log }), 1);
  assert.ok(out.lines.some((line) => /user-1/.test(line) && /delete/i.test(line)));
});
