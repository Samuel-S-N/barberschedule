export type RecoveryLink =
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error" }
  | { kind: "none" };

export function parseRecoveryUrl(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: "none" };

  const [beforeHash, fragment = ""] = url.split("#");
  const query = beforeHash.split("?")[1] ?? "";
  const params = new URLSearchParams([query, fragment].filter(Boolean).join("&"));

  if (params.get("error") || params.get("error_code") || params.get("error_description")) return { kind: "error" };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (accessToken && refreshToken && params.get("type") === "recovery") {
    return { accessToken, kind: "tokens", refreshToken };
  }

  return { kind: "none" };
}

// Proof that the current session came from a recovery link (set by the provider on web, by startRecoverySession on
// native). Module-level on purpose: the loading gate remounts the screen, and this must outlive it.
let recoveryProof = false;

export const markRecovery = () => {
  recoveryProof = true;
};
export const hasRecovery = () => recoveryProof;
export const clearRecovery = () => {
  recoveryProof = false;
};
