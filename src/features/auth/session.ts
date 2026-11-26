import type { Session } from "@supabase/supabase-js";

import type { AppRole } from "./types";

type ResolveAuthRedirectInput = {
  // An owner whose business is not open yet is kept on the setup checklist instead of the panel.
  ownerSetupPending?: boolean;
  // A legal document the user has not accepted in its current version: the app is blocked behind /accept-terms.
  pendingLegal?: boolean;
  profileRole: AppRole | null;
  segments: string[];
  session: Session | null;
};

// Readable without a session (and by anyone signed in): the legal documents and the password-reset landing.
const PUBLIC_SEGMENTS = new Set(["legal", "privacidade", "termos", "contrato", "reset-password"]);

// The four panel tabs: while the setup is pending they lead to /setup. The screens the checklist steps open stay reachable.
const OWNER_PANEL_ROOTS = new Set(["agenda", "revenue", "manage", "settings"]);

export const LOGIN_ROUTE = "/login";
export const HOME_ROUTE = "/";
export const PROFESSIONAL_HOME_ROUTE = "/my-agenda";

function getTopLevelGroup(segments: string[]) {
  return segments.find((segment) => segment.startsWith("(")) ?? null;
}

const GROUP_ROLE: Record<string, AppRole> = {
  "(professional)": "professional",
  "(customer)": "customer",
  "(owner)": "owner",
};

export function resolveAuthRedirect({
  ownerSetupPending = false,
  pendingLegal = false,
  profileRole,
  segments,
  session,
}: ResolveAuthRedirectInput) {
  if (segments[0] && PUBLIC_SEGMENTS.has(segments[0])) {
    return null;
  }

  const group = getTopLevelGroup(segments);

  if (!session) {
    return group === "(auth)" ? null : LOGIN_ROUTE;
  }

  if (segments[0] === "accept-terms") {
    return pendingLegal ? null : HOME_ROUTE;
  }

  if (pendingLegal) {
    return "/accept-terms";
  }

  if (group === "(auth)") {
    return HOME_ROUTE;
  }

  if (profileRole === "owner" && group === "(owner)") {
    const screen = segments[segments.length - 1];

    if (ownerSetupPending && OWNER_PANEL_ROOTS.has(screen)) return "/setup";
    if (!ownerSetupPending && screen === "setup") return "/agenda";
  }

  const requiredRole = group ? GROUP_ROLE[group] : undefined;

  if (!requiredRole || profileRole === requiredRole) {
    return null;
  }

  // "/" is also an owner route, so a professional sent there from an owner screen would stay stuck in the owner group.
  return profileRole === "professional" ? PROFESSIONAL_HOME_ROUTE : HOME_ROUTE;
}
