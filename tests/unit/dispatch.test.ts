import { createDispatcher, pickRows } from "../../supabase/functions/dispatch-notifications/dispatch";
import type { ClaimedNotification, Deps } from "../../supabase/functions/dispatch-notifications/dispatch";

const base: ClaimedNotification = {
  attempts: 1, event_type: "appointment.booked", expo_push_token: null, id: "n1", locale: "en", max_attempts: 3,
  payload: { service_name: "Cut", shop_id: "s1", starts_at: "2026-12-01T12:00:00Z" },
  recipient_role: "customer", shop_slug: "shop-a", web_origin: null, web_subscription: null,
};
const sub = (name: string) => ({ endpoint: `https://push.example/${name}`, keys: { auth: "a", p256dh: "p" } });
const web = (name: string, origin: string, patch: Partial<ClaimedNotification> = {}): ClaimedNotification => ({ ...base, web_origin: origin, web_subscription: sub(name), ...patch });
const expo = (token: string, patch: Partial<ClaimedNotification> = {}): ClaimedNotification => ({ ...base, expo_push_token: token, ...patch });

function deps(patch: Partial<Deps> = {}) {
  const calls: string[] = [];
  const all: Deps = {
    deactivateExpo: async (token) => { calls.push(`deactivateExpo:${token}`); },
    deactivateWeb: async (endpoint) => { calls.push(`deactivateWeb:${endpoint}`); },
    markFailed: async (id, error) => { calls.push(`failed:${id}:${error}`); },
    markSent: async (id) => { calls.push(`sent:${id}`); },
    sendExpo: async (token) => { calls.push(`expo:${token}`); return { ok: true }; },
    sendWeb: async (subscription) => { calls.push(`web:${subscription.endpoint}`); return { status: 201 }; },
    ...patch,
  };

  return { calls, dispatch: createDispatcher(all) };
}

describe("pickRows", () => {
  it("keeps only the web subscription on the notification's own shop when there is one", () => {
    const rows = [web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-b.zencpro.app")];

    expect(pickRows(rows).map((row) => row.web_subscription?.endpoint)).toEqual(["https://push.example/a"]);
  });

  it("falls back to every web subscription when none is on that shop", () => {
    const rows = [web("a", "https://shop-c.zencpro.app"), web("b", "https://shop-d.zencpro.app")];

    expect(pickRows(rows)).toHaveLength(2);
  });

  it("falls back to every web subscription when the notification has no shop", () => {
    const rows = [web("a", "https://shop-a.zencpro.app", { shop_slug: null }), web("b", "https://shop-b.zencpro.app", { shop_slug: null })];

    expect(pickRows(rows)).toHaveLength(2);
  });

  it("matches the slug on a localhost origin with a port", () => {
    expect(pickRows([web("a", "http://shop-a.localhost:4173"), web("b", "http://shop-b.localhost:4173")])).toHaveLength(1);
  });

  it("never filters Expo rows and keeps them next to the chosen web rows", () => {
    const rows = [expo("T1"), web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-b.zencpro.app")];

    expect(pickRows(rows).map((row) => row.expo_push_token ?? row.web_subscription?.endpoint)).toEqual(["T1", "https://push.example/a"]);
  });

  it("groups by outbox id", () => {
    const rows = [web("a", "https://shop-a.zencpro.app", { id: "n1" }), web("b", "https://shop-b.zencpro.app", { id: "n2", shop_slug: "shop-b" })];

    expect(pickRows(rows)).toHaveLength(2);
  });

  it("keeps a token-less row only when it is the group's only row", () => {
    expect(pickRows([base])).toEqual([base]);
    expect(pickRows([base, expo("T1")])).toEqual([expo("T1")]);
  });
});

describe("dispatcher: Expo (behaviour that must not change)", () => {
  it("sends and marks sent", async () => {
    const { calls, dispatch } = deps();

    await expect(dispatch([expo("T1")])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(calls).toEqual(["expo:T1", "sent:n1"]);
  });

  it("deactivates a token the device no longer has, then fails the notification", async () => {
    const { calls, dispatch } = deps({ sendExpo: async () => ({ error: "DeviceNotRegistered", ok: false }) });

    await expect(dispatch([expo("T1")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls).toEqual(["deactivateExpo:T1", "failed:n1:DeviceNotRegistered"]);
  });

  it("marks a row without any token as sent (skipped)", async () => {
    const { calls, dispatch } = deps();

    await expect(dispatch([base])).resolves.toEqual({ failed: 0, sent: 0, skipped: 1 });
    expect(calls).toEqual(["sent:n1"]);
  });

  it("marks a sender that throws as failed", async () => {
    const { calls, dispatch } = deps({ sendExpo: async () => { throw new Error("boom"); } });

    await expect(dispatch([expo("T1")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls).toEqual(["failed:n1:boom"]);
  });
});

describe("dispatcher: web", () => {
  it("sends the localized title and body with the origin plus the role's screen", async () => {
    let seen: unknown;
    const { calls, dispatch } = deps({ sendWeb: async (subscription, message) => { seen = message; calls.push(`web:${subscription.endpoint}`); return { status: 201 }; } });

    await expect(dispatch([web("a", "https://shop-a.zencpro.app", { locale: "pt" })])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(seen).toMatchObject({ title: "Agendamento confirmado", url: "https://shop-a.zencpro.app/appointments" });
    expect(calls).toContain("sent:n1");
  });

  it("deactivates a subscription the push service no longer knows (404 and 410)", async () => {
    for (const status of [404, 410]) {
      const { calls, dispatch } = deps({ sendWeb: async () => ({ status }) });

      await expect(dispatch([web("a", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
      expect(calls).toEqual(["deactivateWeb:https://push.example/a", "failed:n1:WebPushGone"]);
    }
  });

  it("retries later on other push-service errors without deactivating", async () => {
    const { calls, dispatch } = deps({ sendWeb: async () => ({ status: 503 }) });

    await expect(dispatch([web("a", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls).toEqual(["failed:n1:Web push HTTP 503"]);
  });

  it("only uses the own-shop subscription when the user has several", async () => {
    const { calls, dispatch } = deps();

    await dispatch([web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-b.zencpro.app")]);

    expect(calls.filter((call) => call.startsWith("web:"))).toEqual(["web:https://push.example/a"]);
  });

  it("sends to Expo and web when the user has both", async () => {
    const { calls, dispatch } = deps();

    await dispatch([expo("T1"), web("a", "https://shop-a.zencpro.app")]);

    expect(calls.filter((call) => /^(expo|web):/.test(call))).toEqual(["expo:T1", "web:https://push.example/a"]);
  });
});
