import type { SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "professional" | "customer" | "owner";

export type Profile = {
  avatarPath?: string | null;
  // Whether the 24 h reminder e-mail is on for this Zenc account (every business). Undefined on an older server: counts as on.
  emailReminders?: boolean;
  fullName?: string | null;
  nickname?: string | null;
  role: AppRole;
  userId: string;
};

export type AuthSupabaseClient = Pick<SupabaseClient, "auth" | "rpc">;
