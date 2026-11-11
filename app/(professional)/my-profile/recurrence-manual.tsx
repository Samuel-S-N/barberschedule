import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";

import { searchMyCustomers } from "../../../src/features/appointments/professional-booking";
import { getMyProfessionalProfile } from "../../../src/features/professionals/api";
import { ManualRecurrenceFlow } from "../../../src/features/recurrence/ManualRecurrenceFlow";
import { formatInstantInShopTime } from "../../../src/lib/dates/shop-time";
import { useSupabaseSession } from "../../../src/providers/AppProviders";

// The professional creates a recurring plan for one of their customers: customer › plan › day › time › review (see ManualRecurrenceFlow).
export default function ProfessionalRecurrenceManualScreen() {
  const router = useRouter();
  const { profile, supabase } = useSupabaseSession();
  const [term, setTerm] = useState("");
  const professional = useQuery({ queryFn: () => getMyProfessionalProfile(supabase), queryKey: ["my-professional-profile", profile?.userId] });
  const customers = useQuery({ queryFn: () => searchMyCustomers(supabase, term), queryKey: ["professional-customers", term] });

  return (
    <ManualRecurrenceFlow
      professionals={professional.data ? [{ avatarUrl: professional.data.avatarUrl, id: professional.data.id, name: professional.data.name }] : []}
      customers={(customers.data ?? []).map((customer) => ({ id: customer.id, name: customer.fullName }))}
      onCreated={() => router.navigate({ params: { created: "1" }, pathname: "/my-profile/recurrence" })}
      onExit={() => router.navigate("/my-profile/recurrence")}
      onSearch={setTerm}
      today={formatInstantInShopTime(new Date()).localDate}
    />
  );
}
