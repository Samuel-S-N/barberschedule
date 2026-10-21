import type { InboxKind } from "./inbox-api";

const AGENDA = { barber: "/my-agenda", customer: "/appointments", owner: "/agenda" } as const;

// Plan 6 adds the recurrence kinds here.
export function inboxRoute(_kind: InboxKind, role: keyof typeof AGENDA) {
  return AGENDA[role];
}

// Role-specific URLs: the role groups share one URL space, so two groups cannot both own "/notifications".
const NOTIFICATIONS = { barber: "/barber-notifications", customer: "/notifications", owner: "/owner-notifications" } as const;

export function notificationsPath(role: keyof typeof NOTIFICATIONS) {
  return NOTIFICATIONS[role];
}
