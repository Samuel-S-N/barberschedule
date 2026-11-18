import { isServiceRequest } from "./auth.ts";
import { createDispatcher } from "./dispatch.ts";
import type { ClaimedNotification, Message, WebSubscription } from "./dispatch.ts";
import { createWebSender } from "./web-push-lib.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const expoPushUrl = "https://exp.host/--/api/v2/push/send";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function supabaseRpc(name: string, body: Record<string, unknown>) {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`${name} failed with HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

async function sendExpo(token: string, message: Message, data: Record<string, unknown>) {
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const response = await fetch(expoPushUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ to: token, ...message, data }),
  });
  const result = (await response.json().catch(() => null)) as { data?: { details?: { error?: string }; status?: string } } | null;

  if (response.ok && result?.data?.status !== "error") return { ok: true };

  return { error: result?.data?.details?.error ?? `Expo HTTP ${response.status}`, ok: false };
}

// Built on the first web notification, so a missing VAPID secret only fails web rows (and says why), never the Expo ones.
let webSender: ReturnType<typeof createWebSender> | undefined;
function sendWeb(subscription: WebSubscription, message: { body: string; title: string; url: string }) {
  webSender ??= createWebSender({
    privateKey: requiredEnv("VAPID_PRIVATE_KEY"),
    publicKey: requiredEnv("VAPID_PUBLIC_KEY"),
    subject: requiredEnv("VAPID_SUBJECT"),
  });

  return webSender(subscription, message);
}

const dispatchRows = createDispatcher({
  deactivateExpo: async (token) => { await supabaseRpc("deactivate_notification_token", { target_expo_push_token: token }); },
  deactivateWeb: async (endpoint) => { await supabaseRpc("deactivate_web_subscription", { target_endpoint: endpoint }); },
  markFailed: async (id, error) => { await supabaseRpc("mark_notification_failed", { target_error: error, target_id: id }); },
  markSent: async (id) => { await supabaseRpc("mark_notification_sent", { target_id: id }); },
  sendExpo,
  sendWeb,
});

async function dispatch(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!isServiceRequest(request.headers.get("Authorization"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const claimed = (await supabaseRpc("claim_notification_batch", { target_limit: 50 })) as ClaimedNotification[];

  return Response.json(await dispatchRows(claimed ?? []));
}

Deno.serve(dispatch);
