type Role = "professional" | "customer" | "owner";

const AGENDA: Record<Role, string> = { customer: "/appointments", owner: "/agenda", professional: "/my-agenda" };
const REQUESTS: Record<Role, string> = { customer: "/me/recurrence", owner: "/monthly-customers", professional: "/my-profile/recurrence" };
const PAYOUTS: Record<Role, string> = { customer: "/appointments", owner: "/payouts", professional: "/my-profile/compensation" };

// The screen a push notification opens: the same one the in-app inbox opens for the matching entry (src/features/notifications/inbox-route.ts).
export function notificationPath(eventType: string, role: string | null): string {
  const key: Role = role === "owner" || role === "professional" ? role : "customer";

  if (eventType.startsWith("payout.")) return PAYOUTS[key];
  if (eventType === "recurrence.conflict") return "/recurrence-conflicts";

  return eventType.startsWith("recurrence.") ? REQUESTS[key] : AGENDA[key];
}
