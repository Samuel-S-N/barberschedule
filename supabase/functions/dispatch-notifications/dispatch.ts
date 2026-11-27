import { notificationPath } from "../_shared/notification-path.ts";
import { buildReminderEmail } from "./email.ts";
import type { ReminderPayload } from "./email.ts";
import { buildMessage, withShopName } from "./messages.ts";
import type { EmailSendResult, OutgoingEmail } from "./resend.ts";

// The reminder e-mail is its own outbox row (see migration 0082): it is only ever sent as e-mail, and a retry never touches push.
export const EMAIL_REMINDER_EVENT = "appointment.reminder_email";

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
  recipient_email: string | null;
  recipient_role: string | null;
  shop_name: string | null;
  shop_slug: string | null;
  web_origin: string | null;
  web_subscription: WebSubscription | null;
};

export type Message = { body: string; title: string; url?: string };

export type Deps = {
  appointmentsUrl: (slug: string | null) => string;
  // Optional address of the e-mail logo (EMAIL_LOGO_URL); production uses the default.
  logoUrl?: string;
  deactivateExpo: (token: string) => Promise<void>;
  deactivateWeb: (endpoint: string) => Promise<void>;
  markFailed: (id: string, error: string) => Promise<void>;
  markSent: (id: string) => Promise<void>;
  sendEmail: (email: OutgoingEmail, idempotencyKey: string) => Promise<EmailSendResult>;
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

type Attempt = { error?: string; outcome: "failed" | "sent" | "skipped" };

// 404/410: the subscription is gone. 401/403: it was made under another VAPID key (rotated or foreign), so it can never receive from us.
const PERMANENT_WEB_STATUSES = new Set([401, 403, 404, 410]);

export function createDispatcher(deps: Deps) {
  // One attempt per token row; it only deactivates dead tokens and reports what happened. The notification's own state is decided
  // once per outbox id by the caller (mark_notification_sent/failed act only on a row still "sending": the first call would win).
  async function attempt(row: ClaimedNotification): Promise<Attempt> {
    if (row.event_type === EMAIL_REMINDER_EVENT) {
      if (!row.recipient_email) return { outcome: "skipped" };

      const email = buildReminderEmail(row.payload as ReminderPayload, deps.appointmentsUrl(row.shop_slug), deps.logoUrl);
      const result = await deps.sendEmail({ ...email, to: row.recipient_email }, row.id);

      if (!result.ok) return { error: result.error ?? "E-mail delivery failed", outcome: "failed" };

      return { outcome: result.skipped ? "skipped" : "sent" };
    }

    const message = withShopName(buildMessage(row.event_type, row.locale, row.payload), row.shop_name);

    if (row.web_subscription) {
      const url = `${row.web_origin ?? ""}${notificationPath(row.event_type, row.recipient_role)}`;
      const { status } = await deps.sendWeb(row.web_subscription, { body: message.body, title: message.title, url });

      if (status >= 200 && status < 300) return { outcome: "sent" };
      if (PERMANENT_WEB_STATUSES.has(status)) {
        await deps.deactivateWeb(row.web_subscription.endpoint);
        return { error: status === 404 || status === 410 ? "WebPushGone" : `Web push HTTP ${status}`, outcome: "failed" };
      }

      return { error: `Web push HTTP ${status}`, outcome: "failed" };
    }

    if (!row.expo_push_token) return { outcome: "skipped" };

    const result = await deps.sendExpo(row.expo_push_token, message, row.payload);

    if (result.ok) return { outcome: "sent" };
    if (result.error === "DeviceNotRegistered") await deps.deactivateExpo(row.expo_push_token);

    return { error: result.error ?? "Expo delivery failed", outcome: "failed" };
  }

  return async (rows: ClaimedNotification[]): Promise<Counts> => {
    const counts: Counts = { failed: 0, sent: 0, skipped: 0 };
    const groups = new Map<string, ClaimedNotification[]>();

    for (const row of pickRows(rows)) groups.set(row.id, [...(groups.get(row.id) ?? []), row]);

    for (const [id, group] of groups) {
      const attempts: Attempt[] = [];

      for (const row of group) {
        try {
          attempts.push(await attempt(row));
        } catch (error) {
          attempts.push({ error: error instanceof Error ? error.message : "Unknown delivery error", outcome: "failed" });
        }
      }

      // One outcome per notification: delivered to at least one device is sent (a dead token must not turn it into a retry that
      // re-sends to the devices that already got it); only when every attempt failed does it go back for another try.
      if (attempts.some((item) => item.outcome === "sent")) {
        await deps.markSent(id);
        counts.sent++;
      } else if (attempts.some((item) => item.outcome === "failed")) {
        await deps.markFailed(id, attempts.find((item) => item.outcome === "failed")?.error ?? "Delivery failed");
        counts.failed++;
      } else {
        await deps.markSent(id);
        counts.skipped++;
      }
    }

    return counts;
  };
}
