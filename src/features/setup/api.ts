import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";

export type SetupStep = "agreement" | "details" | "hours" | "services" | "team";
export type SetupProfessional = { hasHours: boolean; hasServices: boolean; id: string; name: string };
export type SetupStatus = { completed: boolean; missing: SetupStep[]; professionals: SetupProfessional[] };

export async function getShopSetupStatus(supabase: Pick<SupabaseClient, "rpc">, shopId: string): Promise<SetupStatus> {
  const { data, error } = await supabase.rpc("shop_setup_status", { p_shop_id: shopId });

  if (error) throw toDomainError(error);

  return data as SetupStatus;
}

export async function completeShopSetup(supabase: Pick<SupabaseClient, "rpc">, shopId: string): Promise<string> {
  const { data, error } = await supabase.rpc("complete_shop_setup", { p_shop_id: shopId });

  if (error) throw toDomainError(error);

  return data as string;
}
