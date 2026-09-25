import type { Session } from "@supabase/supabase-js";

import type { AppRole } from "./types";

type ResolveAuthRedirectInput = {
  profileRole: AppRole | null;
  segments: string[];
  session: Session | null;
};

export const LOGIN_ROUTE = "/login";
export const HOME_ROUTE = "/";

function getTopLevelGroup(segments: string[]) {
  return segments.find((segment) => segment.startsWith("(")) ?? null;
}

const GROUP_ROLE: Record<string, AppRole> = {
  "(customer)": "customer",
  "(owner)": "owner",
};

export function resolveAuthRedirect({
  profileRole,
  segments,
  session,
}: ResolveAuthRedirectInput) {
  if (segments[0] === "legal") {
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

  return requiredRole && profileRole !== requiredRole ? HOME_ROUTE : null;
}
