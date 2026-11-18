import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

function load() {
  const listeners: Record<string, (event: Record<string, unknown>) => void> = {};
  const self = {
    addEventListener: (type: string, listener: (event: Record<string, unknown>) => void) => { listeners[type] = listener; },
    clients: { claim: jest.fn().mockResolvedValue(undefined) },
    skipWaiting: jest.fn(),
  };

  vm.runInNewContext(readFileSync(join(__dirname, "..", "..", "public", "sw.js"), "utf8"), { self });

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
