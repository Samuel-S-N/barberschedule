import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform, type PlatformOSType } from "react-native";

import { createKeyValueStorage, type WebStorage } from "../key-value-storage";

type PublicSupabaseConfig = {
  publishableKey: string;
  url: string;
};

let browserClient: SupabaseClient | null = null;

export { createKeyValueStorage as createSupabaseStorage };

export function buildSupabaseAuthOptions(
  platform: PlatformOSType = Platform.OS,
  webStorage?: WebStorage,
) {
  return {
    autoRefreshToken: true,
    detectSessionInUrl: platform === "web",
    persistSession: true,
    storage: createKeyValueStorage(platform, webStorage),
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

// A throwaway client used only to verify a password: it never persists a session and uses its own storage key,
// so its sign-in cannot fire the main client's auth events (the root layout blocks the UI while it re-syncs).
export function createPasswordCheckClient() {
  const { publishableKey, url } = readPublicSupabaseConfig();

  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false, storageKey: "sb-password-check" },
  });
}
