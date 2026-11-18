import { useCurrentShop } from "../shops/CurrentShopProvider";

// The shop every booking step works on: the one of the current address. The `shopId` in the booking URLs is only carried along for the
// step navigation; a value there that names another shop is ignored. "" while the shop is still loading.
export function useBookingShopId(): string {
  return useCurrentShop().shop?.id ?? "";
}
