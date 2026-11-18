export type RecoveryFlow = "recovery" | "invite";

export type RecoveryLink =
  | { kind: "tokens"; accessToken: string; refreshToken: string; flow: RecoveryFlow }
  | { kind: "error" }
  | { kind: "none" };

function linkParams(url: string) {
  const [beforeHash, fragment = ""] = url.split("#");
  const query = beforeHash.split("?")[1] ?? "";

  return new URLSearchParams([query, fragment].filter(Boolean).join("&"));
}

export function parseRecoveryUrl(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: "none" };

  const params = linkParams(url);

  if (params.get("error") || params.get("error_code") || params.get("error_description")) return { kind: "error" };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const type = params.get("type");

  if (accessToken && refreshToken && (type === "recovery" || type === "invite")) {
    return { accessToken, flow: type, kind: "tokens", refreshToken };
  }

  return { kind: "none" };
}

// An invite link signs the user in with a plain SIGNED_IN event (no PASSWORD_RECOVERY), and supabase-js removes the hash as soon as
// it consumes it, so the web app captures this before the client is created.
export function isInviteUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const params = linkParams(url);

  return params.get("type") === "invite" && Boolean(params.get("access_token"));
}

// Proof that the current session came from a recovery or invite link (set by the provider on web, by startRecoverySession on
// native). Module-level on purpose: the loading gate remounts the screen, and this must outlive it.
let recoveryProof = false;
let inviteProof = false;

export const markRecovery = () => {
  recoveryProof = true;
};
export const markInvite = () => {
  recoveryProof = true;
  inviteProof = true;
};
export const hasRecovery = () => recoveryProof;
export const isInvite = () => inviteProof;
export const clearRecovery = () => {
  recoveryProof = false;
  inviteProof = false;
};

export type RecoveryStatus = "checking" | "ready" | "invalid";

// Derived from state that survives a remount: setSession fires SIGNED_IN, the loading gate then remounts the screen,
// and the new instance no longer receives the deep-link event.
export function resolveRecoveryStatus(input: {
  hasSession: boolean;
  isLoading: boolean;
  platform: string;
  proof: boolean;
}): RecoveryStatus {
  if (input.isLoading) return "checking";
  if (input.hasSession && input.proof) return "ready";

  // On web the link was already consumed by detectSessionInUrl; on native the deep link may still be on its way.
  return input.platform === "web" ? "invalid" : "checking";
}
