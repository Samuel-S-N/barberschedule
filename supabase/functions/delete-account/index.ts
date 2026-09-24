declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (request) => {
  // Browsers preflight supabase.functions.invoke (custom headers), so OPTIONS must succeed.
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json(401, { code: "UNAUTHENTICATED" });

  const url = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) return json(401, { code: "UNAUTHENTICATED" });
  const { id: userId } = await userResponse.json() as { id: string };

  // Anonymize first: if the admin delete below fails, personal data is already gone and a retry is idempotent.
  const prepared = await fetch(`${url}/rest/v1/rpc/prepare_account_deletion`, {
    body: "{}",
    headers: { apikey: anonKey, Authorization: authorization, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!prepared.ok) {
    const body = await prepared.json().catch(() => ({})) as { code?: string };
    if (body.code === "P0018") return json(409, { code: "ACCOUNT_DELETION_BLOCKED" });
    if (body.code === "42501") return json(403, { code: "FORBIDDEN" });
    return json(500, { code: "DELETION_FAILED" });
  }

  const deleted = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    method: "DELETE",
  });

  return deleted.ok ? json(200, {}) : json(500, { code: "DELETION_FAILED" });
});
