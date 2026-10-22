import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

import { listOwnerBarbers } from "../../src/features/barbers/api";
import type { OwnerBarber } from "../../src/features/barbers/types";
import { listOwnerCustomers } from "../../src/features/customers/api";
import { ManualRecurrenceFlow } from "../../src/features/recurrence/ManualRecurrenceFlow";
import { useOwnerShopId } from "../../src/features/shops/use-owner-shop-id";
import { formatInstantInShopTime } from "../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../src/providers/AppProviders";

// The owner creates a recurring plan for a customer: customer › plan › barber › day › time › review (see ManualRecurrenceFlow).
export default function OwnerRecurrenceManualScreen() {
  const router = useRouter();
  const { supabase } = useSupabaseSession();
  const shop = useOwnerShopId();
  const shopId = shop.data ?? null;
  const customers = useQuery({ enabled: shopId !== null, queryFn: () => listOwnerCustomers(supabase, shopId ?? ""), queryKey: ["owner-manual-customers", shopId] });
  const barbers = useQuery({ enabled: shopId !== null, queryFn: () => listOwnerBarbers(supabase, shopId ?? ""), queryKey: ["owner-manual-barbers", shopId] });

  return (
    <ManualRecurrenceFlow
      barbers={(barbers.data ?? []).filter((barber: OwnerBarber) => barber.active).map((barber: OwnerBarber) => ({ avatarUrl: barber.avatarUrl ?? null, id: barber.id, name: barber.name }))}
      customers={(customers.data ?? []).filter((customer) => customer.active).map((customer) => ({ id: customer.id, name: customer.fullName }))}
      onCreated={() => router.navigate({ params: { created: "1" }, pathname: "/monthly-customers" })}
      onExit={() => router.navigate("/monthly-customers")}
      today={formatInstantInShopTime(new Date()).localDate}
    />
  );
}
