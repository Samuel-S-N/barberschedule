jest.mock("../../src/lib/key-value-storage", () => {
  const store = new Map<string, string>();

  return {
    createKeyValueStorage: () => ({
      getItem: async (key: string) => store.get(key) ?? null,
      removeItem: async (key: string) => void store.delete(key),
      setItem: async (key: string, value: string) => void store.set(key, value),
    }),
  };
});

import { getShopTheme, normalizeThemeColor, readCachedTheme, updateShopTheme, writeCachedTheme } from "../../src/features/shops/theme";

describe("normalizeThemeColor", () => {
  it("accepts six hex digits with or without #, in any case", () => {
    expect(normalizeThemeColor("2f6fdb")).toEqual({ ok: true, value: "#2F6FDB" });
    expect(normalizeThemeColor(" #2f6fdb ")).toEqual({ ok: true, value: "#2F6FDB" });
  });

  it("maps an empty field to 'not chosen'", () => {
    expect(normalizeThemeColor("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects anything else", () => {
    for (const value of ["blue", "#12", "#GGGGGG", "#2F6FDB0"]) {
      expect(normalizeThemeColor(value)).toEqual({ ok: false });
    }
  });
});

function fakeClient(result: { data?: unknown; error?: unknown }) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};

  builder.select = (columns: string) => {
    calls.select = columns;
    return builder;
  };
  builder.order = () => builder;
  builder.limit = () => Promise.resolve(result);
  builder.update = (payload: unknown) => {
    calls.update = payload;
    return builder;
  };
  builder.eq = (column: string, value: string) => {
    calls.eq = [column, value];
    return Promise.resolve(result);
  };

  return {
    calls,
    client: {
      from: (table: string) => {
        calls.table = table;
        return builder;
      },
    } as never,
  };
}

describe("getShopTheme", () => {
  it("reads the id and the three colours of the first shop", async () => {
    const { calls, client } = fakeClient({ data: [{ id: "s1", theme_accent: null, theme_base: "#EEF3F8", theme_primary: "#2F6FDB" }] });

    await expect(getShopTheme(client)).resolves.toEqual({ input: { accent: null, base: "#EEF3F8", primary: "#2F6FDB" }, shopId: "s1" });
    expect(calls.table).toBe("shops");
    expect(calls.select).toBe("id, theme_primary, theme_accent, theme_base");
  });

  it("returns null when there is no shop", async () => {
    await expect(getShopTheme(fakeClient({ data: [] }).client)).resolves.toBeNull();
  });

  it("throws the database error", async () => {
    await expect(getShopTheme(fakeClient({ error: new Error("boom") }).client)).rejects.toThrow("boom");
  });
});

describe("updateShopTheme", () => {
  it("writes the three columns for the shop", async () => {
    const { calls, client } = fakeClient({});

    await updateShopTheme(client, "s1", { accent: null, base: "#EEF3F8", primary: "#2F6FDB" });

    expect(calls.update).toEqual({ theme_accent: null, theme_base: "#EEF3F8", theme_primary: "#2F6FDB" });
    expect(calls.eq).toEqual(["id", "s1"]);
  });

  it("refuses an invalid colour before calling the database", async () => {
    const { calls, client } = fakeClient({});

    await expect(updateShopTheme(client, "s1", { accent: null, base: null, primary: "blue" })).rejects.toThrow();
    expect(calls.update).toBeUndefined();
  });
});

describe("cached theme", () => {
  it("round-trips per user and returns null when nothing is cached", async () => {
    await writeCachedTheme("u1", { accent: null, base: null, primary: "#2F6FDB" });

    await expect(readCachedTheme("u1")).resolves.toEqual({ accent: null, base: null, primary: "#2F6FDB" });
    await expect(readCachedTheme("u2")).resolves.toBeNull();
  });

  it("drops invalid stored colours instead of trusting them", async () => {
    await writeCachedTheme("u3", { accent: "javascript:alert(1)", base: null, primary: "#2F6FDB" });

    await expect(readCachedTheme("u3")).resolves.toEqual({ accent: null, base: null, primary: "#2F6FDB" });
  });
});
