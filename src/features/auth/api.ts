import { TERMS_VERSION } from "../account/legal";
import { clearRecovery, markRecovery } from "./recovery";
import type { AuthSupabaseClient, Profile } from "./types";
import type { SignupInput } from "./validation";

type CurrentProfileRow = {
  avatar_path?: string | null;
  full_name?: string | null;
  nickname?: string | null;
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
    ...(typeof row.avatar_path !== "undefined" ? { avatarPath: row.avatar_path } : {}),
    ...(typeof row.nickname !== "undefined" ? { nickname: row.nickname } : {}),
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
        ...(input.nickname ? { nickname: input.nickname } : {}),
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
  redirectTo: string,
) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  throwIfError(error);
}

// The loading gate remounts the reset screen after setSession fires SIGNED_IN, so the consumed token is kept at
// module level: a remount must not spend the same refresh token twice.
let consumedRefreshToken: string | null = null;

export async function startRecoverySession(
  supabase: Pick<AuthSupabaseClient, "auth">,
  link: { accessToken: string; refreshToken: string },
) {
  if (consumedRefreshToken === link.refreshToken) return true;

  consumedRefreshToken = link.refreshToken;
  const { error } = await supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken });

  if (error) {
    consumedRefreshToken = null;
    return false;
  }

  markRecovery();
  return true;
}

export async function completePasswordReset(supabase: Pick<AuthSupabaseClient, "auth">, password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  throwIfError(error);
  clearRecovery();
  consumedRefreshToken = null;
  await supabase.auth.signOut({ scope: "global" });
}
