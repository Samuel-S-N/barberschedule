import type { InboxKind } from "./inbox-api";

const AGENDA = { barber: "/my-agenda", customer: "/appointments", owner: "/agenda" } as const;

// Plan 6 adds the recurrence kinds here.
export function inboxRoute(_kind: InboxKind, role: keyof typeof AGENDA) {
  return AGENDA[role];
}
