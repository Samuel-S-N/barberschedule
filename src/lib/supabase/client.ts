import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform, type PlatformOSType } from "react-native";

type PublicSupabaseConfig = {
  publishableKey: string;
  url: string;
};

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

type WebStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

let browserClient: SupabaseClient | null = null;
const memoryStorage = new Map<string, string>();

function createMemoryStorage(): SupabaseStorage {
  return {
    async getItem(key) {
      return memoryStorage.get(key) ?? null;
    },
    async removeItem(key) {
      memoryStorage.delete(key);
    },
    async setItem(key, value) {
      memoryStorage.set(key, value);
    },
  };
}

function getWebStorage(webStorage?: WebStorage): WebStorage | null {
  if (webStorage) {
    return webStorage;
  }

  if (typeof globalThis.localStorage !== "undefined") {
    return globalThis.localStorage;
  }

  return null;
}

export function createSupabaseStorage(
  platform: PlatformOSType = Platform.OS,
  webStorage?: WebStorage,
): SupabaseStorage {
  if (platform === "web") {
    const storage = getWebStorage(webStorage);

    if (!storage) {
      return createMemoryStorage();
    }

    return {
      async getItem(key) {
        return storage.getItem(key);
      },
      async removeItem(key) {
        storage.removeItem(key);
      },
      async setItem(key, value) {
        storage.setItem(key, value);
      },
    };
  }

  return {
    getItem(key) {
      return SecureStore.getItemAsync(key);
    },
    removeItem(key) {
      return SecureStore.deleteItemAsync(key);
    },
    setItem(key, value) {
      return SecureStore.setItemAsync(key, value);
    },
  };
}

export function buildSupabaseAuthOptions(
  platform: PlatformOSType = Platform.OS,
  webStorage?: WebStorage,
) {
  return {
    autoRefreshToken: true,
    detectSessionInUrl: platform === "web",
    persistSession: true,
    storage: createSupabaseStorage(platform, webStorage),
  };
}

export function readPublicSupabaseConfig(): PublicSupabaseConfig {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL");
  }

  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!publishableKey) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return { publishableKey, url };
}

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { publishableKey, url } = readPublicSupabaseConfig();

  browserClient = createClient(url, publishableKey, {
    auth: buildSupabaseAuthOptions(),
  });

  return browserClient;
}
