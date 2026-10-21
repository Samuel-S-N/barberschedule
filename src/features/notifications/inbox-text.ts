import type { InboxKind } from "./inbox-api";

export function inboxText(kind: InboxKind) {
  return { bodyKey: `notifications.${kind}.body`, titleKey: `notifications.${kind}.title` };
}
