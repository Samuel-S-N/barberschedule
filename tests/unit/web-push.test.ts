import { enableWebPush, unsubscribeWebPush, urlBase64ToUint8Array } from "../../src/features/notifications/web-push";

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
