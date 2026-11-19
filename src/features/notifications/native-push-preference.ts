import { createKeyValueStorage } from "../../lib/key-value-storage";

const OFF_KEY = "zenc.push-off";

// "The user switched notifications off on this device": start-up registration must not turn them back on.
export async function isNativePushDisabled() {
  return (await createKeyValueStorage().getItem(OFF_KEY)) === "1";
}

export async function setNativePushDisabled(value: boolean) {
  const storage = createKeyValueStorage();

  if (value) await storage.setItem(OFF_KEY, "1");
  else await storage.removeItem(OFF_KEY);
}
