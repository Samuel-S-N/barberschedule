import { formatInstantInShopTime } from "../../lib/dates/shop-time";
import type { InboxKind } from "./inbox-api";

type Role = "professional" | "customer" | "owner";
type Target = { appointmentId: string | null; startsAt: string };

const AGENDA: Record<Role, string> = { professional: "/my-agenda", customer: "/appointments", owner: "/agenda" };
const REQUESTS: Record<Role, string> = { professional: "/my-profile/recurrence", customer: "/me/recurrence", owner: "/monthly-customers" };

const PAYOUTS: Record<Role, string> = { professional: "/my-profile/compensation", customer: "/appointments", owner: "/payouts" };

// Staff land on the appointment's day with its pop-up open (the card there has the Confirm button); everyone else on their agenda root.
export function inboxRoute(kind: InboxKind, role: Role, target?: Target) {
  if (kind.startsWith("payout_")) return PAYOUTS[role];
  if (kind.startsWith("recurrence_")) return REQUESTS[role];
  if (role === "customer" || !target?.appointmentId || !target.startsAt) return AGENDA[role];
  const { localDate } = formatInstantInShopTime(new Date(target.startsAt));

  return `${AGENDA[role]}?date=${localDate}&open=${encodeURIComponent(target.appointmentId)}`;
}

// Role-specific URLs: the role groups share one URL space, so two groups cannot both own "/notifications".
const NOTIFICATIONS = { professional: "/professional-notifications", customer: "/notifications", owner: "/owner-notifications" } as const;

export function notificationsPath(role: keyof typeof NOTIFICATIONS) {
  return NOTIFICATIONS[role];
}
