import { disableWebPush, enableWebPush, unsubscribeWebPush, urlBase64ToUint8Array, withTimeout } from "../../src/features/notifications/web-push";

const json = { endpoint: "https://push.example/a", keys: { auth: "a", p256dh: "p" } };
const registration = (subscribe = jest.fn().mockResolvedValue({ toJSON: () => json })) => ({ pushManager: { subscribe } });

describe("urlBase64ToUint8Array", () => {
  it("decodes URL-safe base64 with or without padding", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

describe("enableWebPush", () => {
  it("asks for permission first, subscribes with the VAPID key and saves with the origin and language", async () => {
    const order: string[] = [];
    const subscribe = jest.fn().mockImplementation(async () => { order.push("subscribe"); return { toJSON: () => json }; });
    const save = jest.fn().mockImplementation(async () => { order.push("save"); });

    const outcome = await enableWebPush({
      getRegistration: async () => { order.push("registration"); return registration(subscribe); },
      locale: "pt", origin: "https://shop-a.zencpro.app", publicKey: "AQID",
      requestPermission: async () => { order.push("permission"); return "granted"; },
      save,
    });

    expect(outcome).toBe("on");
    expect(order).toEqual(["permission", "registration", "subscribe", "save"]);
    expect(Array.from((subscribe.mock.calls[0][0] as { applicationServerKey: Uint8Array }).applicationServerKey)).toEqual([1, 2, 3]);
    expect(subscribe.mock.calls[0][0]).toMatchObject({ userVisibleOnly: true });
    expect(save).toHaveBeenCalledWith(json, "https://shop-a.zencpro.app", "pt");
  });

  it("stops at a denied permission without subscribing or saving", async () => {
    const subscribe = jest.fn();
    const save = jest.fn();

    await expect(enableWebPush({ getRegistration: async () => registration(subscribe), locale: null, origin: "https://a", publicKey: "AQID", requestPermission: async () => "denied", save })).resolves.toBe("denied");
    expect(subscribe).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("treats a dismissed prompt as not enabled", async () => {
    await expect(enableWebPush({ getRegistration: async () => registration(), locale: null, origin: "https://a", publicKey: "AQID", requestPermission: async () => "default", save: jest.fn() })).resolves.toBe("denied");
  });
});

describe("unsubscribeWebPush", () => {
  it("does nothing on native", async () => {
    const rpc = jest.fn();

    await expect(unsubscribeWebPush({ rpc } as never)).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("withTimeout", () => {
  it("resolves with the value when it is quick", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("rejects when the promise never settles (a service worker that never became ready)", async () => {
    await expect(withTimeout(new Promise(() => undefined), 20)).rejects.toThrow("timed out");
  });
});

describe("disableWebPush", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const setRegistration = (subscription: unknown) => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) } } });
  };

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
  });

  it("deactivates the subscription on the server, then unsubscribes the browser", async () => {
    const calls: string[] = [];
    const rpc = jest.fn().mockImplementation(async () => { calls.push("server"); return { error: null }; });
    setRegistration({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribe: async () => { calls.push("browser"); return true; } });

    await disableWebPush({ rpc } as never);

    expect(rpc).toHaveBeenCalledWith("deactivate_my_web_subscription", { target_endpoint: "https://fcm.googleapis.com/fcm/send/abc" });
    expect(calls).toEqual(["server", "browser"]);
  });

  it("keeps the browser subscription when the server call fails (the switch must not lie)", async () => {
    const unsubscribe = jest.fn();
    setRegistration({ endpoint: "https://x", unsubscribe });

    await expect(disableWebPush({ rpc: jest.fn().mockResolvedValue({ error: new Error("offline") }) } as never)).rejects.toThrow();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("does nothing without a subscription", async () => {
    const rpc = jest.fn();
    setRegistration(null);

    await disableWebPush({ rpc } as never);

    expect(rpc).not.toHaveBeenCalled();
  });
});
