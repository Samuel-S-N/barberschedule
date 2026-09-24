import { TERMS_VERSION } from "../account/legal";
import type { AuthSupabaseClient, Profile } from "./types";
import type { SignupInput } from "./validation";

type CurrentProfileRow = {
  full_name?: string | null;
  role: Profile["role"];
  user_id: string;
};

function throwIfError(error: Error | null) {
  if (error) {
    throw error;
  }
}

function toProfile(row: CurrentProfileRow): Profile {
  return {
    ...(typeof row.full_name !== "undefined"
      ? { fullName: row.full_name ?? null }
      : {}),
    role: row.role,
    userId: row.user_id,
  };
}

export async function getCurrentProfile(
  supabase: Pick<AuthSupabaseClient, "rpc">,
) {
  const { data, error } = await supabase.rpc("get_current_profile");
  throwIfError(error);

  const row = Array.isArray(data) ? data[0] : data;

  return row ? toProfile(row as CurrentProfileRow) : null;
}

export async function isShopOwner(
  supabase: Pick<AuthSupabaseClient, "rpc">,
  shopId: string,
) {
  const { data, error } = await supabase.rpc("is_shop_owner", {
    shop_id: shopId,
  });
  throwIfError(error);

  return Boolean(data);
}

export async function signInWithPassword(
  supabase: Pick<AuthSupabaseClient, "auth">,
  email: string,
  password: string,
) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  throwIfError(error);
}

export async function signUpCustomer(
  supabase: Pick<AuthSupabaseClient, "auth">,
  input: SignupInput,
) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    options: {
      data: {
        accepted_terms_version: TERMS_VERSION,
        full_name: input.fullName,
        ...(input.phone ? { phone: input.phone } : {}),
      },
    },
    password: input.password,
  });
  throwIfError(error);

  return { needsEmailConfirmation: !data.session };
}

export async function signOut(supabase: Pick<AuthSupabaseClient, "auth">) {
  const { error } = await supabase.auth.signOut();
  throwIfError(error);
}

export async function requestPasswordReset(
  supabase: Pick<AuthSupabaseClient, "auth">,
  email: string,
) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  throwIfError(error);
}
