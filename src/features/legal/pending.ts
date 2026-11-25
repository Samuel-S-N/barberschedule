import type { AppRole } from "../auth/types";
import { LEGAL_VERSIONS } from "./index";
import type { LegalKind } from "./types";

export type Consent = { kind: LegalKind; version: string };

// Owners accept the business agreement in the setup checklist (part C) the first time, so the gate only asks for it afterwards.
export function requiredKinds(role: AppRole | null, { setupComplete }: { setupComplete: boolean }): LegalKind[] {
  if (!role) return [];
  if (role === "owner" && setupComplete) return ["terms", "privacy", "business"];

  return ["terms", "privacy"];
}

// Versions are ISO dates, so a plain string comparison orders them.
export function pendingKinds(required: LegalKind[], consents: Consent[], versions: Record<LegalKind, string> = LEGAL_VERSIONS): LegalKind[] {
  return required.filter((kind) => !consents.some((consent) => consent.kind === kind && consent.version >= versions[kind]));
}

// The versions accepted with the signup checkbox travel in the user metadata. The server records them as consent rows only when the
// customer layout runs `ensure_my_customer`, AFTER the root gate has already asked, so the gate counts them too (same fallback as the SQL).
export function signupConsents(metadata: Record<string, unknown> | undefined): Consent[] {
  const text = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  const terms = text(metadata?.accepted_terms_version);
  const privacy = text(metadata?.accepted_privacy_version) ?? terms;

  return [...(terms ? [{ kind: "terms" as const, version: terms }] : []), ...(privacy ? [{ kind: "privacy" as const, version: privacy }] : [])];
}
