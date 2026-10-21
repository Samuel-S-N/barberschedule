import { stepHref } from "../../features/booking/steps";

export type RouteParams = Record<string, string | string[] | undefined>;
type Parent = string | ((params: RouteParams) => string | null);

const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

// Tab roots and entry screens: no parent, the system back button keeps its default behaviour.
export const ROOT_ROUTES = new Set([
  "/", "/login",
  "/home", "/book", "/appointments", "/profile",
  "/my-agenda", "/clients", "/earnings", "/my-profile",
  "/agenda", "/revenue", "/manage", "/settings",
]);

// Screens reachable from several places (terms, a password-reset e-mail link) keep the history behaviour.
export const HISTORY_ROUTES = new Set(["/legal", "/reset-password"]);

const bookingIds = (params: RouteParams) => ({
  barberId: text(params.barberId),
  barberServiceId: text(params.barberServiceId),
  localDate: text(params.localDate),
  shopId: text(params.shopId),
});

export const ROUTE_PARENTS: Record<string, Parent> = {
  // auth
  "/forgot-password": "/login",
  "/signup": "/login",

  // customer
  "/book/barber": "/home",
  "/book/service": (params) => stepHref("barber", bookingIds(params)),
  "/book/date": (params) => stepHref("service", bookingIds(params)),
  "/book/time": (params) => stepHref("date", bookingIds(params)),
  "/book/review": (params) => stepHref("time", bookingIds(params)),
  "/reschedule": "/appointments",
  "/notifications": "/home",
  "/me/account": "/profile",
  "/me/security": "/profile",
  "/me/security/password": "/me/security",
  "/me/settings": "/profile",
  "/me/language": "/me/settings",
  "/me/privacy": "/profile",
  "/me/about": "/profile",
  "/me/recurrence": "/profile",

  // barber
  "/clients/[id]": "/clients",
  "/move-appointment": "/my-agenda",
  "/barber-notifications": "/my-agenda",
  "/my-profile/account": "/my-profile",
  "/my-profile/availability": "/my-profile",
  "/my-profile/compensation": "/my-profile",
  "/my-profile/services": "/my-profile",
  "/my-profile/recurrence": "/my-profile",
  "/my-profile/security": "/my-profile",
  "/my-profile/security/password": "/my-profile/security",
  "/my-profile/settings": "/my-profile",
  "/my-profile/language": "/my-profile/settings",
  "/my-profile/privacy": "/my-profile",
  "/my-profile/about": "/my-profile",

  // owner
  "/owner-notifications": "/agenda",
  "/appointment-form": "/agenda",
  "/recurrence-plans": "/manage",
  "/recurrence-plan-form": "/recurrence-plans",
  "/barbers": "/manage",
  "/barber-new": "/barbers",
  "/barber-profile": "/barbers",
  "/services": "/manage",
  "/service-form": "/services",
  "/customers": "/manage",
  "/customer-form": "/customers",
  "/monthly-customers": "/manage",
  "/recurrence-conflicts": "/monthly-customers",
  "/schedule": "/manage",
  "/shop": "/manage",
  "/owner-profile/account": "/settings",
  "/owner-profile/security": "/settings",
  "/owner-profile/security/password": "/owner-profile/security",
  "/owner-profile/settings": "/settings",
  "/language": "/owner-profile/settings",
  "/owner-profile/privacy": "/settings",
  "/owner-profile/about": "/settings",
};

// "/clients/[id]" from the segments the router reports: groups ("(barber)") and a trailing "index" are not part of the URL.
export function routePattern(segments: string[]) {
  const parts = segments.filter((segment) => !/^\(.*\)$/.test(segment));
  if (parts[parts.length - 1] === "index") parts.pop();

  return `/${parts.join("/")}`;
}

export function parentOf(pattern: string, params: RouteParams = {}): string | null {
  const parent = ROUTE_PARENTS[pattern];

  if (parent === undefined) return null;

  return typeof parent === "function" ? parent(params) : parent;
}
