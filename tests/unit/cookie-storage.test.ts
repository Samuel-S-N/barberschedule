import { createCookieStorage } from "../../src/lib/supabase/cookie-storage";

// A tiny in-memory document.cookie: remembers name -> value, honours Max-Age=0 as deletion.
function fakeJar() {
  const cookies = new Map<string, string>();
  const writes: string[] = [];

  return {
    cookies,
    jar: {
      read: () => [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      write: (cookie: string) => {
        writes.push(cookie);
        const [pair, ...attributes] = cookie.split("; ");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);

        if (attributes.includes("Max-Age=0")) cookies.delete(name);
        else cookies.set(name, pair.slice(index + 1));
      },
    },
    writes,
  };
}

const long = JSON.stringify({ access_token: "a".repeat(7000), refresh_token: "r".repeat(100), user: { name: "João ✂️" } });

describe("createCookieStorage", () => {
  it("round-trips a value larger than one cookie through numbered chunks", async () => {
    const { cookies, jar } = fakeJar();
    const storage = createCookieStorage(jar, { secure: true });

    await storage.setItem("sb-x-auth-token", long);

    expect([...cookies.keys()].sort()).toEqual(["sb-x-auth-token.0", "sb-x-auth-token.1", "sb-x-auth-token.2"]);
    for (const value of cookies.values()) expect(value.length).toBeLessThanOrEqual(3000);
    await expect(storage.getItem("sb-x-auth-token")).resolves.toBe(long);
  });

  it("writes Secure, SameSite=Lax, Path and the shared domain", async () => {
    const { jar, writes } = fakeJar();
    await createCookieStorage(jar, { domain: ".zencpro.app", secure: true }).setItem("k", "v");

    expect(writes[0]).toContain("Path=/");
    expect(writes[0]).toContain("SameSite=Lax");
    expect(writes[0]).toContain("Secure");
    expect(writes[0]).toContain("Domain=.zencpro.app");
  });

  it("omits Domain and Secure for host-only development cookies", async () => {
    const { jar, writes } = fakeJar();
    await createCookieStorage(jar, { secure: false }).setItem("k", "v");

    expect(writes[0]).not.toContain("Domain");
    expect(writes[0]).not.toContain("Secure");
  });

  it("drops stale higher chunks when a shorter value is saved", async () => {
    const { cookies, jar } = fakeJar();
    const storage = createCookieStorage(jar, { secure: true });

    await storage.setItem("k", long);
    await storage.setItem("k", "short");

    expect([...cookies.keys()]).toEqual(["k.0"]);
    await expect(storage.getItem("k")).resolves.toBe("short");
  });

  it("removes every chunk", async () => {
    const { cookies, jar } = fakeJar();
    const storage = createCookieStorage(jar, { secure: true });

    await storage.setItem("k", long);
    await storage.removeItem("k");

    expect(cookies.size).toBe(0);
    await expect(storage.getItem("k")).resolves.toBeNull();
  });

  it("reads a session a previous version left in localStorage, then moves it to cookies on the next write", async () => {
    const { cookies, jar } = fakeJar();
    const legacy = { getItem: jest.fn().mockReturnValue("old-session"), removeItem: jest.fn() };
    const storage = createCookieStorage(jar, { legacy, secure: true });

    await expect(storage.getItem("k")).resolves.toBe("old-session");
    await storage.setItem("k", "new-session");

    expect(cookies.get("k.0")).toBe("new-session");
    expect(legacy.removeItem).toHaveBeenCalledWith("k");
  });
});
