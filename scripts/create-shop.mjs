// Creates a business and invites its owner. Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-shop.mjs --name "Barbearia do João" --slug barbeariadojoao --owner joao@email.com
// Optional: --timezone America/Sao_Paulo, SHOP_URL_TEMPLATE="https://{slug}.zencpro.app".
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildShopUrl, DEFAULT_SHOP_URL_TEMPLATE } from "../supabase/functions/_shared/shop-url.ts";
import { RESERVED_SLUGS, SLUG_PATTERN } from "../src/features/shops/resolve-slug.ts";

const validTimezone = (zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

export function parseArgs(argv) {
  const values = {};

  for (let index = 0; index < argv.length; index += 2) values[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  for (const flag of ["name", "slug", "owner"]) if (!values[flag]?.trim()) throw new Error(`Missing --${flag}`);
  if (!SLUG_PATTERN.test(values.slug)) throw new Error("Invalid slug: use 3 to 32 lowercase letters, digits or hyphens, no hyphen at either end.");
  if (RESERVED_SLUGS.includes(values.slug)) throw new Error(`The slug "${values.slug}" is reserved.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.owner)) throw new Error("Invalid --owner e-mail.");
  if (values.timezone !== undefined && !validTimezone(values.timezone)) throw new Error(`Invalid --timezone "${values.timezone}".`);

  return { name: values.name.trim(), owner: values.owner.trim(), slug: values.slug, timezone: values.timezone };
}

export async function run({ argv, env, fetch: send, log }) {
  let args;

  try {
    args = parseArgs(argv);
    for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!env[name]) throw new Error(`Missing environment variable ${name}`);
  } catch (error) {
    log(error.message);
    return 1;
  }

  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const template = env.SHOP_URL_TEMPLATE || DEFAULT_SHOP_URL_TEMPLATE;
  const redirectTo = buildShopUrl(template, args.slug, "/reset-password");

  try {
    // The likeliest failure is a taken slug: find out before an invite e-mail goes out (its link would die with the undo).
    const existing = await send(`${base}/rest/v1/shops?slug=eq.${encodeURIComponent(args.slug)}&select=id`, { headers });
    if (existing.ok && ((await existing.json().catch(() => [])) ?? []).length > 0) {
      log(`The slug "${args.slug}" is taken or not allowed. Nothing was sent.`);
      return 1;
    }

    const invited = await send(`${base}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, { body: JSON.stringify({ email: args.owner }), headers, method: "POST" });
    if (!invited.ok) {
      const failure = await invited.json().catch(() => ({}));

      log(failure.error_code === "email_exists"
        ? `${args.owner} already has an account. Promoting existing accounts is not supported: use another e-mail.`
        : `Could not invite ${args.owner} (HTTP ${invited.status}).`);
      return 1;
    }
    const { id: userId } = await invited.json().catch(() => ({}));
    if (!userId) {
      log("The invite answered without a user id; check the Auth users list before retrying.");
      return 1;
    }

    // From here on the invited user must be removed if the business cannot be created.
    const undo = async (reason) => {
      let deleted;

      try {
        deleted = (await send(`${base}/auth/v1/admin/users/${userId}`, { headers, method: "DELETE" })).ok;
      } catch {
        deleted = false;
      }
      log(deleted ? `${reason} The invite was undone.` : `${reason} Could not delete the invited user ${userId}: delete it in the Auth users list.`);

      return 1;
    };

    let created;

    try {
      created = await send(`${base}/rest/v1/rpc/create_shop`, {
        body: JSON.stringify({ p_name: args.name, p_owner_user_id: userId, p_slug: args.slug, p_timezone: args.timezone ?? "America/Sao_Paulo" }),
        headers,
        method: "POST",
      });
    } catch {
      return undo("create_shop could not be reached.");
    }
    if (!created.ok) {
      const failure = await created.json().catch(() => ({}));

      return undo(failure.code === "P0041" ? `The slug "${args.slug}" is taken or not allowed.`
        : failure.code === "P0042" ? "That account cannot own a new business."
        : `create_shop failed (HTTP ${created.status}).`);
    }

    log(`Business created: ${buildShopUrl(template, args.slug)}`);
    log(`Invite sent to ${args.owner}. Generate the QR code from that link and send it to the business.`);
    log(`The shop starts closed: its owner must finish the setup checklist at ${buildShopUrl(template, args.slug)} before customers can book (visitors see "Em breve" until then).`);
    return 0;
  } catch (error) {
    log(`Request failed: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run({ argv: process.argv.slice(2), env: process.env, fetch, log: console.log });
}
