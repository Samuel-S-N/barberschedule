import { buildMessage } from "./messages.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type ClaimedNotification = {
  attempts: number;
  event_type: string;
  expo_push_token: string | null;
  id: string;
  locale: string | null;
  max_attempts: number;
  payload: Record<string, unknown>;
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

async function markSent(id: string) {
  await supabaseRpc("mark_notification_sent", { target_id: id });
}

async function markFailed(id: string, error: string) {
  await supabaseRpc("mark_notification_failed", { target_error: error, target_id: id });
}

async function dispatchOne(notification: ClaimedNotification) {
  if (!notification.expo_push_token) {
    await markSent(notification.id);
    return "skipped";
  }

  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const response = await fetch(expoPushUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      to: notification.expo_push_token,
      ...buildMessage(notification.event_type, notification.locale, notification.payload),
      data: notification.payload,
    }),
  });

  const result = (await response.json().catch(() => null)) as {
    data?: { details?: { error?: string }; status?: string };
  } | null;
  const providerError = result?.data?.details?.error;

  if (response.ok && result?.data?.status !== "error") {
    await markSent(notification.id);
    return "sent";
  }

  if (providerError === "DeviceNotRegistered") {
    await supabaseRpc("deactivate_notification_token", {
      target_expo_push_token: notification.expo_push_token,
    });
  }

  await markFailed(notification.id, providerError ?? `Expo HTTP ${response.status}`);
  return "failed";
}

async function dispatch(request: Request) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const claimed = (await supabaseRpc("claim_notification_batch", { target_limit: 50 })) as ClaimedNotification[];
  const results = { failed: 0, sent: 0, skipped: 0 };

  for (const notification of claimed ?? []) {
    try {
      results[await dispatchOne(notification)]++;
    } catch (error) {
      await markFailed(notification.id, error instanceof Error ? error.message : "Unknown delivery error");
      results.failed++;
    }
  }

  return Response.json(results);
}

Deno.serve(dispatch);
