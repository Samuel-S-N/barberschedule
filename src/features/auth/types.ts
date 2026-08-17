import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "customer" | "owner";

export type Profile = {
  fullName?: string | null;
  role: AppRole;
  userId: string;
};

export type AuthSupabaseClient = Pick<SupabaseClient, "auth" | "rpc">;
