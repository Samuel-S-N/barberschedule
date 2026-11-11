import type { Session } from "@supabase/supabase-js";

import type { AppRole } from "./types";

type ResolveAuthRedirectInput = {
  profileRole: AppRole | null;
  segments: string[];
  session: Session | null;
};

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
  profileRole,
  segments,
  session,
}: ResolveAuthRedirectInput) {
  if (segments[0] === "legal" || segments[0] === "reset-password") {
    return null;
  }

  const group = getTopLevelGroup(segments);

  if (!session) {
    return group === "(auth)" ? null : LOGIN_ROUTE;
  }

  if (group === "(auth)") {
    return HOME_ROUTE;
  }

  const requiredRole = group ? GROUP_ROLE[group] : undefined;

  if (!requiredRole || profileRole === requiredRole) {
    return null;
  }

  // "/" is also an owner route, so a professional sent there from an owner screen would stay stuck in the owner group.
  return profileRole === "professional" ? PROFESSIONAL_HOME_ROUTE : HOME_ROUTE;
}
