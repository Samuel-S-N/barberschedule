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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Promotion to `barber` and the barbers.user_id link happen here, with the service role,
// never from signup metadata: the public signUp path must not be able to claim a barber row.
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders, status: 204 });
  if (request.method !== "POST") return json(405, { code: "METHOD_NOT_ALLOWED" });

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json(401, { code: "UNAUTHENTICATED" });

  const { barberId, email } = (await request.json().catch(() => ({}))) as { barberId?: string; email?: string };
  if (!barberId || !UUID.test(barberId) || !email || !EMAIL.test(email)) return json(400, { code: "INVALID_INPUT" });

  const url = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const service = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!userResponse.ok) return json(401, { code: "UNAUTHENTICATED" });

  const barberResponse = await fetch(
    `${url}/rest/v1/barbers?id=eq.${barberId}&select=id,shop_id,user_id,active`,
    { headers: service },
  );
  const [barber] = (await barberResponse.json().catch(() => [])) as Array<{
    active: boolean;
    id: string;
    shop_id: string;
    user_id: string | null;
  }>;
  if (!barber) return json(403, { code: "FORBIDDEN" });

  // The caller's own JWT decides ownership, so this cannot be spoofed by the body.
  const ownerResponse = await fetch(`${url}/rest/v1/rpc/is_shop_owner`, {
    body: JSON.stringify({ shop_id: barber.shop_id }),
    headers: { apikey: anonKey, Authorization: authorization, "Content-Type": "application/json" },
    method: "POST",
  });
  if (!ownerResponse.ok || (await ownerResponse.json()) !== true) return json(403, { code: "FORBIDDEN" });

  if (barber.user_id || !barber.active) return json(409, { code: "BARBER_INVITE_CONFLICT" });

  const invited = await fetch(`${url}/auth/v1/invite`, {
    body: JSON.stringify({ email }),
    headers: service,
    method: "POST",
  });
  if (!invited.ok) {
    return json(invited.status === 422 || invited.status === 409 ? 409 : 500, { code: "BARBER_INVITE_CONFLICT" });
  }
  const { id: userId } = (await invited.json()) as { id: string };

  // Guarded by user_id is null so two racing invites cannot both link the same barber row.
  const linked = await fetch(`${url}/rest/v1/barbers?id=eq.${barberId}&user_id=is.null`, {
    body: JSON.stringify({ invited_at: new Date().toISOString(), user_id: userId }),
    headers: { ...service, Prefer: "return=representation" },
    method: "PATCH",
  });
  const linkedRows = linked.ok ? ((await linked.json()) as unknown[]) : [];
  if (linkedRows.length === 0) {
    await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers: service, method: "DELETE" });
    return json(409, { code: "BARBER_INVITE_CONFLICT" });
  }

  const promoted = await fetch(`${url}/rest/v1/profiles?user_id=eq.${userId}`, {
    body: JSON.stringify({ role: "barber" }),
    headers: service,
    method: "PATCH",
  });
  if (!promoted.ok) return json(500, { code: "INVITE_FAILED" });

  return json(200, { userId });
});
