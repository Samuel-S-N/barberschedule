import * as SecureStore from "expo-secure-store";

import {
  buildSupabaseAuthOptions,
  createSupabaseStorage,
} from "../../src/lib/supabase/client";
import {
  DEFAULT_E2E_WEB_PORT,
  getE2EWebBaseUrl,
  getE2EWebPort,
  selectE2EWebPort,
} from "../../src/lib/testing/e2e-web";

describe("task 1 review fixes", () => {
  const originalEnv = process.env.BARBERSCHEDULE_E2E_WEB_PORT;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BARBERSCHEDULE_E2E_WEB_PORT;
    } else {
      process.env.BARBERSCHEDULE_E2E_WEB_PORT = originalEnv;
    }
  });

  it("uses a deterministic default web e2e port and supports env override", () => {
    delete process.env.BARBERSCHEDULE_E2E_WEB_PORT;
    expect(getE2EWebPort()).toBe(DEFAULT_E2E_WEB_PORT);
    expect(getE2EWebBaseUrl()).toBe(
      `http://127.0.0.1:${DEFAULT_E2E_WEB_PORT}`,
    );

    process.env.BARBERSCHEDULE_E2E_WEB_PORT = "4411";
    expect(getE2EWebPort()).toBe(4411);
    expect(getE2EWebBaseUrl()).toBe("http://127.0.0.1:4411");
  });

  it("chooses the next free port when the preferred port is occupied", async () => {
    await expect(
      selectE2EWebPort({
        isPortAvailable: async (port) => port === DEFAULT_E2E_WEB_PORT + 1,
        preferredPort: DEFAULT_E2E_WEB_PORT,
      }),
    ).resolves.toBe(DEFAULT_E2E_WEB_PORT + 1);
  });

  it("fails clearly when no free port is available in the scan range", async () => {
    await expect(
      selectE2EWebPort({
        isPortAvailable: async () => false,
        maxPort: DEFAULT_E2E_WEB_PORT + 1,
        preferredPort: DEFAULT_E2E_WEB_PORT,
      }),
    ).rejects.toThrow(
      `No free localhost port found for BARBERSCHEDULE_E2E_WEB_PORT starting at ${DEFAULT_E2E_WEB_PORT}`,
    );
  });

  it("uses localStorage-backed persistence on web", async () => {
    const localStorage = {
      getItem: jest.fn(() => "session"),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    };

    const storage = createSupabaseStorage("web", localStorage);

    await expect(storage.getItem("token")).resolves.toBe("session");
    await storage.setItem("token", "value");
    await storage.removeItem("token");

    expect(localStorage.getItem).toHaveBeenCalledWith("token");
    expect(localStorage.setItem).toHaveBeenCalledWith("token", "value");
    expect(localStorage.removeItem).toHaveBeenCalledWith("token");

    const auth = buildSupabaseAuthOptions("web", localStorage);
    expect(auth.persistSession).toBe(true);
    expect(auth.detectSessionInUrl).toBe(true);
    await expect(auth.storage.getItem("token")).resolves.toBe("session");
  });

  it("uses SecureStore-backed persistence on native", async () => {
    const getItemAsync = jest
      .spyOn(SecureStore, "getItemAsync")
      .mockResolvedValue("native-session");
    const setItemAsync = jest
      .spyOn(SecureStore, "setItemAsync")
      .mockResolvedValue();
    const deleteItemAsync = jest
      .spyOn(SecureStore, "deleteItemAsync")
      .mockResolvedValue();

    const storage = createSupabaseStorage("ios");

    await expect(storage.getItem("token")).resolves.toBe("native-session");
    await storage.setItem("token", "value");
    await storage.removeItem("token");

    expect(getItemAsync).toHaveBeenCalledWith("token");
    expect(setItemAsync).toHaveBeenCalledWith("token", "value");
    expect(deleteItemAsync).toHaveBeenCalledWith("token");

    const auth = buildSupabaseAuthOptions("ios");
    expect(auth.persistSession).toBe(true);
    expect(auth.detectSessionInUrl).toBe(false);
  });
});
