import { createDispatcher, pickRows } from "../../supabase/functions/dispatch-notifications/dispatch";
import type { ClaimedNotification, Deps } from "../../supabase/functions/dispatch-notifications/dispatch";

const base: ClaimedNotification = {
  attempts: 1, event_type: "appointment.booked", expo_push_token: null, id: "n1", locale: "en", max_attempts: 3,
  payload: { service_name: "Cut", shop_id: "s1", starts_at: "2026-12-01T12:00:00Z" },
  recipient_role: "customer", shop_name: null, shop_slug: "shop-a", web_origin: null, web_subscription: null,
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

describe("dispatcher: several tokens for one notification", () => {
  it("a gone web subscription next to a working Expo token still marks the notification sent, once", async () => {
    const { calls, dispatch } = deps({ sendWeb: async () => ({ status: 410 }) });

    await expect(dispatch([web("a", "https://shop-a.zencpro.app"), expo("T1")])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(calls.filter((call) => call.startsWith("sent:") || call.startsWith("failed:"))).toEqual(["sent:n1"]);
    expect(calls).toContain("deactivateWeb:https://push.example/a");
  });

  it("a failing Expo token next to a working web subscription marks it sent, once", async () => {
    const { calls, dispatch } = deps({ sendExpo: async () => ({ error: "MessageRateExceeded", ok: false }) });

    await expect(dispatch([expo("T1"), web("a", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(calls.filter((call) => call.startsWith("sent:") || call.startsWith("failed:"))).toEqual(["sent:n1"]);
  });

  it("when every token fails the notification is marked failed once, with the first error", async () => {
    const { calls, dispatch } = deps({ sendExpo: async () => ({ error: "DeviceNotRegistered", ok: false }), sendWeb: async () => ({ status: 503 }) });

    await expect(dispatch([expo("T1"), web("a", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 1, sent: 0, skipped: 0 });
    expect(calls.filter((call) => call.startsWith("sent:") || call.startsWith("failed:"))).toEqual(["failed:n1:DeviceNotRegistered"]);
    expect(calls).toContain("deactivateExpo:T1");
  });

  it("two web rows of the same notification are one outcome", async () => {
    const { calls, dispatch } = deps();

    await expect(dispatch([web("a", "https://shop-a.zencpro.app"), web("b", "https://shop-a.zencpro.app")])).resolves.toEqual({ failed: 0, sent: 1, skipped: 0 });
    expect(calls.filter((call) => call.startsWith("sent:"))).toEqual(["sent:n1"]);
  });

  it("separate notifications keep separate outcomes", async () => {
    const { dispatch } = deps({ sendExpo: async (token) => (token === "BAD" ? { error: "x", ok: false } : { ok: true }) });

    await expect(dispatch([expo("T1", { id: "n1" }), expo("BAD", { id: "n2" })])).resolves.toEqual({ failed: 1, sent: 1, skipped: 0 });
  });

  it("401 and 403 from the push service (a subscription made under another VAPID key) deactivate it like 410", async () => {
    for (const status of [401, 403]) {
      const { calls, dispatch } = deps({ sendWeb: async () => ({ status }) });

      await dispatch([web("a", "https://shop-a.zencpro.app")]);
      expect(calls).toContain("deactivateWeb:https://push.example/a");
    }
  });
});

describe("dispatcher: the shop name is the title", () => {
  it("web: title is the shop name, the event title starts the body, the url is unchanged", async () => {
    const sent: Array<{ body: string; title: string; url: string }> = [];
    const { dispatch } = deps({ sendWeb: async (_subscription, message) => { sent.push(message); return { status: 201 }; } });

    await dispatch([web("a", "https://shop-a.zencpro.app", { locale: "pt", shop_name: "Studio Bella" })]);

    expect(sent[0].title).toBe("Studio Bella");
    expect(sent[0].body).toMatch(/^Agendamento confirmado: Cut em /);
    expect(sent[0].url).toBe("https://shop-a.zencpro.app/appointments");
  });

  it("Expo: the same title and body, and the data still carries the shop id", async () => {
    const sent: Array<{ data: Record<string, unknown>; message: { body: string; title: string } }> = [];
    const { dispatch } = deps({ sendExpo: async (_token, message, data) => { sent.push({ data, message }); return { ok: true }; } });

    await dispatch([expo("T1", { locale: "en", shop_name: "Studio Bella" })]);

    expect(sent[0].message.title).toBe("Studio Bella");
    expect(sent[0].message.body).toMatch(/^Appointment booked: Cut on /);
    expect(sent[0].data).toMatchObject({ shop_id: "s1" });
  });

  it("an event with no shop name keeps today's title on both channels", async () => {
    const web_: string[] = [];
    const expo_: string[] = [];
    const { dispatch } = deps({
      sendExpo: async (_token, message) => { expo_.push(message.title); return { ok: true }; },
      sendWeb: async (_subscription, message) => { web_.push(message.title); return { status: 201 }; },
    });

    await dispatch([expo("T1", { shop_name: null }), web("a", "https://shop-a.zencpro.app", { id: "n2", shop_name: null })]);

    expect(expo_).toEqual(["Appointment booked"]);
    expect(web_).toEqual(["Appointment booked"]);
  });
});
