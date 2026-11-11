import type { InboxKind } from "./inbox-api";

type Role = "professional" | "customer" | "owner";

const AGENDA: Record<Role, string> = { professional: "/my-agenda", customer: "/appointments", owner: "/agenda" };
const REQUESTS: Record<Role, string> = { professional: "/my-profile/recurrence", customer: "/me/recurrence", owner: "/monthly-customers" };

export function inboxRoute(kind: InboxKind, role: Role) {
  return kind.startsWith("recurrence_") ? REQUESTS[role] : AGENDA[role];
}

// Role-specific URLs: the role groups share one URL space, so two groups cannot both own "/notifications".
const NOTIFICATIONS = { professional: "/professional-notifications", customer: "/notifications", owner: "/owner-notifications" } as const;

export function notificationsPath(role: keyof typeof NOTIFICATIONS) {
  return NOTIFICATIONS[role];
}
