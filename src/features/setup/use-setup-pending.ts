import { useSupabaseSession } from "../../providers/AppProviders";
import { useCurrentShop } from "../shops/CurrentShopProvider";

// An owner is always on their own shop's address (ShopGate redirects any other host), so the current shop IS theirs.
export function useSetupPending(): boolean {
  const { profile } = useSupabaseSession();
  const { shop } = useCurrentShop();

  return profile?.role === "owner" && shop?.ready === false;
}
