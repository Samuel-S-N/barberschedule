import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";

import { searchMyCustomers } from "../../../src/features/appointments/barber-booking";
import { getMyBarberProfile } from "../../../src/features/barbers/api";
import { ManualRecurrenceFlow } from "../../../src/features/recurrence/ManualRecurrenceFlow";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

// The barber creates a recurring plan for one of their customers: customer › plan › day › time › review (see ManualRecurrenceFlow).
export default function BarberRecurrenceManualScreen() {
  const router = useRouter();
  const { profile, supabase } = useSupabaseSession();
  const [term, setTerm] = useState("");
  const barber = useQuery({ queryFn: () => getMyBarberProfile(supabase), queryKey: ["my-barber-profile", profile?.userId] });
  const customers = useQuery({ queryFn: () => searchMyCustomers(supabase, term), queryKey: ["barber-customers", term] });

  return (
    <ManualRecurrenceFlow
      barbers={barber.data ? [{ avatarUrl: barber.data.avatarUrl, id: barber.data.id, name: barber.data.name }] : []}
      customers={(customers.data ?? []).map((customer) => ({ id: customer.id, name: customer.fullName }))}
      onCreated={() => router.navigate({ params: { created: "1" }, pathname: "/my-profile/recurrence" })}
      onExit={() => router.navigate("/my-profile/recurrence")}
      onSearch={setTerm}
      today={formatInstantInShopTime(new Date()).localDate}
    />
  );
}
