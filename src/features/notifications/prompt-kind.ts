import { Platform } from "react-native";

import { readNativePermission } from "./native-push";
import { readWebPushEnvironment } from "./web-push";
import { resolvePromptKind } from "./web-push-state";
import type { PromptKind } from "./web-push-state";

export async function readPromptKind(): Promise<PromptKind | null> {
  if (Platform.OS === "web") return resolvePromptKind(await readWebPushEnvironment());

  return (await readNativePermission()) === "undetermined" ? "ask" : null;
}
