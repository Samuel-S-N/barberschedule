const memory = new Map<string, string>();

jest.mock("../../src/lib/key-value-storage", () => ({
  createKeyValueStorage: () => ({
    getItem: async (key: string) => memory.get(key) ?? null,
    removeItem: async (key: string) => { memory.delete(key); },
    setItem: async (key: string, value: string) => { memory.set(key, value); },
  }),
}));

import { hasBeenPrompted, markPrompted } from "../../src/features/notifications/prompt-store";

describe("prompt store", () => {
  beforeEach(() => memory.clear());

  it("remembers that this device was prompted", async () => {
    expect(await hasBeenPrompted()).toBe(false);
    await markPrompted();

    expect(await hasBeenPrompted()).toBe(true);
  });
});
