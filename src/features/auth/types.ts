import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "barber" | "customer" | "owner";

export type Profile = {
  avatarUrl?: string | null;
  fullName?: string | null;
  role: AppRole;
  userId: string;
};

export type AuthSupabaseClient = Pick<SupabaseClient, "auth" | "rpc">;
