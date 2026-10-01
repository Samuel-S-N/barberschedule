import * as SecureStore from "expo-secure-store";
import { Platform, type PlatformOSType } from "react-native";

type KeyValueStorage = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
  setItem: (key: string, value: string) => Promise<void>;
};

export type WebStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

const memoryStorage = new Map<string, string>();

function createMemoryStorage(): KeyValueStorage {
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

export function createKeyValueStorage(
  platform: PlatformOSType = Platform.OS,
  webStorage?: WebStorage,
): KeyValueStorage {
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
