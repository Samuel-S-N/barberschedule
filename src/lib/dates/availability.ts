import type { AvailableSlot } from "../../features/availability/types";
import { formatInstantInShopTime } from "./shop-time";

export function formatAvailableSlotStart(slot: AvailableSlot) {
  return formatInstantInShopTime(new Date(slot.startsAt));
}
