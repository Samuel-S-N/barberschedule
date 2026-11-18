import type { AppRole } from "../auth/types";
import type { CurrentShopStatus } from "./CurrentShopProvider";

export type ShopRoute =
  | { kind: "app" }
  | { kind: "wait" }
  | { kind: "not-found" }
  | { kind: "error" }
  | { kind: "bare" }
  | { kind: "redirect"; slug: string };

type Input = {
  currentSlug: string | null;
  // undefined while the staff lookup is loading, null when the account has no staff shop.
  mySlug: string | null | undefined;
  role: AppRole | null;
  signedIn: boolean;
  status: CurrentShopStatus;
};

// Which page a visitor may see on this host. Staff always belong to their own shop's subdomain; customers to the shop in the host.
export function resolveShopRoute({ currentSlug, mySlug, role, signedIn, status }: Input): ShopRoute {
  const staff = signedIn && (role === "owner" || role === "professional");

  if (staff && mySlug === undefined) return { kind: "wait" };
  if (staff && mySlug && mySlug !== currentSlug) return { kind: "redirect", slug: mySlug };
  if (status === "loading") return { kind: "wait" };
  if (status === "no-slug") return signedIn ? { kind: "bare" } : { kind: "app" };
  if (status === "not-found") return { kind: "not-found" };
  if (status === "error") return { kind: "error" };

  return { kind: "app" };
}
