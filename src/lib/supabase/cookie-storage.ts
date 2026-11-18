// Session storage for supabase-js on web: the session lives in cookies, so a login on one shop subdomain is valid on the others
// (cookie Domain = ".zencpro.app"). A session is larger than one cookie (~4 KB), so it is split into numbered chunks
// "<key>.0", "<key>.1", ...; each chunk is URL-encoded and kept under CHUNK_LENGTH characters.
const CHUNK_LENGTH = 3000;
const MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookie lifetime at 400 days

export type CookieJar = { read: () => string; write: (cookie: string) => void };
type LegacyStorage = Pick<Storage, "getItem" | "removeItem">;
type Options = { domain?: string; legacy?: LegacyStorage | null; secure: boolean };

function splitEncoded(value: string): string[] {
  const chunks: string[] = [];
  let current = "";

  // `for...of` walks code points, so a surrogate pair is never cut in half.
  for (const char of value) {
    const encoded = encodeURIComponent(char);

    if (current.length + encoded.length > CHUNK_LENGTH) {
      chunks.push(current);
      current = "";
    }
    current += encoded;
  }
  chunks.push(current);

  return chunks;
}

export function createCookieStorage(jar: CookieJar, { domain, legacy = null, secure }: Options) {
  const attributes = (maxAge: number) => ["Path=/", "SameSite=Lax", `Max-Age=${maxAge}`, ...(domain ? [`Domain=${domain}`] : []), ...(secure ? ["Secure"] : [])].join("; ");
  const readAll = () => new Map(jar.read().split("; ").filter(Boolean).map((part): [string, string] => { const i = part.indexOf("="); return [part.slice(0, i), part.slice(i + 1)]; }));
  const chunkNames = (key: string) => [...readAll().keys()].filter((name) => name.startsWith(`${key}.`));
  const clearCookies = (key: string) => chunkNames(key).forEach((name) => jar.write(`${name}=; ${attributes(0)}`));

  return {
    async getItem(key: string): Promise<string | null> {
      const all = readAll();
      const parts: string[] = [];

      for (let index = 0; all.has(`${key}.${index}`); index += 1) parts.push(all.get(`${key}.${index}`)!);

      if (parts.length === 0) return legacy?.getItem(key) ?? null;

      try {
        return decodeURIComponent(parts.join(""));
      } catch {
        // A corrupt cookie is no session; the client signs the user out instead of crashing.
        return null;
      }
    },
    async removeItem(key: string): Promise<void> {
      clearCookies(key);
      legacy?.removeItem(key);
    },
    async setItem(key: string, value: string): Promise<void> {
      clearCookies(key);
      splitEncoded(value).forEach((chunk, index) => jar.write(`${key}.${index}=${chunk}; ${attributes(MAX_AGE)}`));
      legacy?.removeItem(key);
    },
  };
}

export function createBrowserCookieStorage() {
  const domain = process.env.EXPO_PUBLIC_AUTH_COOKIE_DOMAIN || undefined;
  const legacy = typeof localStorage === "undefined" ? null : localStorage;

  return createCookieStorage(
    { read: () => document.cookie, write: (cookie) => { document.cookie = cookie; } },
    { domain, legacy, secure: window.location.protocol === "https:" },
  );
}
