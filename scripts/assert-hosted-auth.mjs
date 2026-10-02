// Run before enabling email_claim_enabled on a hosted project (ADR 011): the claim in
// ensure_my_customer is only safe when Supabase really verifies emails.
// Usage: SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=... node scripts/assert-hosted-auth.mjs
import { pathToFileURL } from "node:url";

export function assertEmailConfirmationsOn(settings) {
  if (settings?.mailer_autoconfirm !== false) {
    throw new Error("Supabase email confirmations are OFF: keep app_settings.email_claim_enabled = false.");
  }
}

async function main() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!res.ok) throw new Error(`auth settings request failed: ${res.status}`);
  assertEmailConfirmationsOn(await res.json());
  console.log("OK: email confirmations are enforced.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
