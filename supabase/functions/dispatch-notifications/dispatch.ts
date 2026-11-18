import { notificationPath } from "../_shared/notification-path.ts";
import { buildMessage } from "./messages.ts";

export type WebSubscription = { endpoint: string; keys: { auth: string; p256dh: string } };

// One row of claim_notification_batch: an outbox notification joined with one of the recipient's active tokens.
export type ClaimedNotification = {
  attempts: number;
  event_type: string;
  expo_push_token: string | null;
  id: string;
  locale: string | null;
  max_attempts: number;
  payload: Record<string, unknown>;
  recipient_role: string | null;
  shop_slug: string | null;
  web_origin: string | null;
  web_subscription: WebSubscription | null;
};

export type Message = { body: string; title: string; url?: string };

export type Deps = {
  deactivateExpo: (token: string) => Promise<void>;
  deactivateWeb: (endpoint: string) => Promise<void>;
  markFailed: (id: string, error: string) => Promise<void>;
  markSent: (id: string) => Promise<void>;
  sendExpo: (token: string, message: Message, data: Record<string, unknown>) => Promise<{ error?: string; ok: boolean }>;
  sendWeb: (subscription: WebSubscription, message: Required<Message>) => Promise<{ status: number }>;
};

type Counts = { failed: number; sent: number; skipped: number };

// "https://shop-a.zencpro.app" and "http://shop-a.localhost:4173" -> "shop-a".
function originSlug(origin: string | null): string | null {
  try {
    return origin ? new URL(origin).hostname.split(".")[0] : null;
  } catch {
    return null;
  }
}

// A user with subscriptions on several shop subdomains only gets the notification on the one of its own shop; with none there (or
// when the event has no shop) every web subscription gets it. Expo rows are never filtered. A row with no token at all stays only
// when it is the group's only row (the "nobody to notify" marker).
export function pickRows(rows: ClaimedNotification[]): ClaimedNotification[] {
  const groups = new Map<string, ClaimedNotification[]>();

  for (const row of rows) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);

  return [...groups.values()].flatMap((group) => {
    const webRows = group.filter((row) => row.web_subscription);
    const own = webRows.filter((row) => group[0].shop_slug !== null && originSlug(row.web_origin) === group[0].shop_slug);
    const chosenWeb = own.length > 0 ? own : webRows;
    const tokenRows = group.filter((row) => row.expo_push_token || row.web_subscription);

    if (tokenRows.length === 0) return [group[0]];

    return group.filter((row) => row.expo_push_token || chosenWeb.includes(row));
  });
}

export function createDispatcher(deps: Deps) {
  async function dispatchOne(row: ClaimedNotification): Promise<keyof Counts> {
    if (row.web_subscription) {
      const message = buildMessage(row.event_type, row.locale, row.payload);
      const url = `${row.web_origin ?? ""}${notificationPath(row.event_type, row.recipient_role)}`;
      const { status } = await deps.sendWeb(row.web_subscription, { body: message.body, title: message.title, url });

      if (status >= 200 && status < 300) {
        await deps.markSent(row.id);
        return "sent";
      }
      if (status === 404 || status === 410) {
        await deps.deactivateWeb(row.web_subscription.endpoint);
        await deps.markFailed(row.id, "WebPushGone");
        return "failed";
      }
      await deps.markFailed(row.id, `Web push HTTP ${status}`);
      return "failed";
    }

    if (!row.expo_push_token) {
      await deps.markSent(row.id);
      return "skipped";
    }

    const result = await deps.sendExpo(row.expo_push_token, buildMessage(row.event_type, row.locale, row.payload), row.payload);

    if (result.ok) {
      await deps.markSent(row.id);
      return "sent";
    }
    if (result.error === "DeviceNotRegistered") await deps.deactivateExpo(row.expo_push_token);
    await deps.markFailed(row.id, result.error ?? "Expo delivery failed");
    return "failed";
  }

  return async (rows: ClaimedNotification[]): Promise<Counts> => {
    const counts: Counts = { failed: 0, sent: 0, skipped: 0 };

    for (const row of pickRows(rows)) {
      try {
        counts[await dispatchOne(row)]++;
      } catch (error) {
        await deps.markFailed(row.id, error instanceof Error ? error.message : "Unknown delivery error");
        counts.failed++;
      }
    }

    return counts;
  };
}
