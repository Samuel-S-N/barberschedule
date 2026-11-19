import { createKeyValueStorage } from "../../lib/key-value-storage";

const KEY = "zenc.notifications-prompted";

// Once per device: remembered locally (per origin on the web, where each shop has its own address).
export async function hasBeenPrompted() {
  return (await createKeyValueStorage().getItem(KEY)) === "1";
}

export async function markPrompted() {
  await createKeyValueStorage().setItem(KEY, "1");
}
