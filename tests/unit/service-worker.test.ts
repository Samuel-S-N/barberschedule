import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

function load() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const self = {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => { listeners[type] = listener; },
    clients: { claim: jest.fn().mockResolvedValue(undefined), matchAll: jest.fn().mockResolvedValue([]), openWindow: jest.fn().mockResolvedValue(undefined) },
    location: { origin: "https://shop-a.zencpro.app" },
    registration: { showNotification: jest.fn().mockResolvedValue(undefined) },
    skipWaiting: jest.fn(),
  };

  vm.runInNewContext(readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8"), { URL, self });

  return { listeners, self };
}

describe("public/sw.js", () => {
  it("has the fetch listener Chrome needs to offer installation, and does not answer requests (no cache)", () => {
    const { listeners } = load();
    const respondWith = jest.fn();

    expect(typeof listeners.fetch).toBe("function");
    listeners.fetch({ respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("activates immediately and claims open tabs", () => {
    const { listeners, self } = load();
    const waitUntil = jest.fn();

    listeners.install({});
    listeners.activate({ waitUntil });

    expect(self.skipWaiting).toHaveBeenCalled();
    expect(self.clients.claim).toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalled();
  });
});

describe("push", () => {
  const event = (data: unknown) => ({ data: { json: () => data }, waitUntil: jest.fn() });

  it("shows the title and body with the Zenc icon and badge and remembers where to go", () => {
    const { listeners, self } = load();
    const push = event({ body: "Corte em 01/12", title: "Agendamento confirmado", url: "https://shop-a.zencpro.app/appointments" });

    listeners.push(push);

    expect(self.registration.showNotification).toHaveBeenCalledWith("Agendamento confirmado", {
      badge: "/icons/icon-192.png", body: "Corte em 01/12", data: { url: "https://shop-a.zencpro.app/appointments" }, icon: "/icons/icon-192.png",
    });
    expect(push.waitUntil).toHaveBeenCalled();
  });

  it("still shows something for an empty or unreadable payload", () => {
    const { listeners, self } = load();

    listeners.push({ data: { json: () => { throw new Error("not json"); } }, waitUntil: jest.fn() });

    expect(self.registration.showNotification).toHaveBeenCalledWith("Zenc", expect.objectContaining({ data: { url: "/" } }));
  });
});

describe("notificationclick", () => {
  const click = (url?: string) => ({ notification: { close: jest.fn(), data: url ? { url } : {} }, waitUntil: jest.fn() });

  it("opens the url in a new window when no Zenc tab is open", async () => {
    const { listeners, self } = load();
    const event = click("https://shop-a.zencpro.app/appointments");

    listeners.notificationclick(event);
    await (event.waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(event.notification.close).toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith("https://shop-a.zencpro.app/appointments");
  });

  it("focuses and navigates an open tab of the same origin instead", async () => {
    const { listeners, self } = load();
    const tab = { focus: jest.fn(), navigate: jest.fn().mockResolvedValue(undefined), url: "https://shop-a.zencpro.app/home" };
    tab.focus.mockResolvedValue(tab);
    self.clients.matchAll.mockResolvedValue([{ focus: jest.fn(), url: "https://shop-b.zencpro.app/home" }, tab]);
    const event = click("https://shop-a.zencpro.app/payouts");

    listeners.notificationclick(event);
    await (event.waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(tab.focus).toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith("https://shop-a.zencpro.app/payouts");
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("falls back to the root when the notification has no url", async () => {
    const { listeners, self } = load();
    const event = click();

    listeners.notificationclick(event);
    await (event.waitUntil.mock.calls[0][0] as Promise<unknown>);

    expect(self.clients.openWindow).toHaveBeenCalledWith("https://shop-a.zencpro.app/");
  });
});
