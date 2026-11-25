import type { AppRole } from "../auth/types";
import type { CurrentShopStatus } from "./CurrentShopProvider";

export type ShopRoute =
  | { kind: "app" }
  | { kind: "wait" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "bare" }
  | { kind: "coming-soon" }
  | { kind: "redirect"; slug: string };

type Input = {
  // Only the web can move to another address; native (Expo Go, development) has no subdomains.
  canRedirect: boolean;
  currentSlug: string | null;
  // undefined while the staff lookup is loading, null when the account has no staff shop.
  mySlug: string | null | undefined;
  role: AppRole | null;
  // Whether the shop in the host is open (setup completed). undefined = unknown, treated as open.
  shopReady?: boolean;
  signedIn: boolean;
  status: CurrentShopStatus;
};

// Which page a visitor may see on this host. Staff always belong to their own shop's subdomain; customers to the shop in the host.
export function resolveShopRoute({ canRedirect, currentSlug, mySlug, role, shopReady, signedIn, status }: Input): ShopRoute {
  const staff = signedIn && (role === "owner" || role === "professional");

  if (staff && mySlug === undefined) return { kind: "wait" };
  if (canRedirect && staff && mySlug && mySlug !== currentSlug) return { kind: "redirect", slug: mySlug };
  if (status === "loading") return { kind: "wait" };
  if (status === "no-slug") return signedIn ? { kind: "bare" } : { kind: "app" };
  if (status === "not-found") return { kind: "not-found" };
  if (status === "error") return { kind: "error" };

  // A closed shop shows "Em breve" to everyone except its own staff (they are setting it up).
  if (shopReady === false && !(staff && mySlug === currentSlug)) return { kind: "coming-soon" };

  return { kind: "app" };
}
