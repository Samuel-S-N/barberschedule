import type { InboxKind } from "./inbox-api";

// Literal template types keep `t()` type-checked against the locale keys.
export function inboxText<K extends InboxKind>(kind: K) {
  return { bodyKey: `notifications.${kind}.body` as const, titleKey: `notifications.${kind}.title` as const };
}
