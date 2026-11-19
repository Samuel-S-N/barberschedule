import { registerServiceWorker } from "../../src/lib/pwa/register-sw";

describe("registerServiceWorker", () => {
  it("registers /sw.js at the root scope on web", async () => {
    const register = jest.fn().mockResolvedValue({});

    await registerServiceWorker({ platform: "web", serviceWorker: { register } });

    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does nothing on native", async () => {
    const register = jest.fn();

    await registerServiceWorker({ platform: "ios", serviceWorker: { register } });

    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", async () => {
    await expect(registerServiceWorker({ platform: "web", serviceWorker: undefined })).resolves.toBeUndefined();
  });

  it("never throws when registration fails", async () => {
    const register = jest.fn().mockRejectedValue(new Error("insecure context"));

    await expect(registerServiceWorker({ platform: "web", serviceWorker: { register } })).resolves.toBeUndefined();
  });
});
