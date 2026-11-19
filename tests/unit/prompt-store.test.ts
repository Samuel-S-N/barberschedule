const mockMemory = new Map<string, string>();

jest.mock("../../src/lib/key-value-storage", () => ({
  createKeyValueStorage: () => ({
    getItem: async (key: string) => mockMemory.get(key) ?? null,
    removeItem: async (key: string) => { mockMemory.delete(key); },
    setItem: async (key: string, value: string) => { mockMemory.set(key, value); },
  }),
}));

import { hasBeenPrompted, markPrompted } from "../../src/features/notifications/prompt-store";

describe("prompt store", () => {
  beforeEach(() => mockMemory.clear());

  it("remembers that this device was prompted", async () => {
    expect(await hasBeenPrompted()).toBe(false);
    await markPrompted();

    expect(await hasBeenPrompted()).toBe(true);
  });
});
