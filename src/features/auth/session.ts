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

export function resolveAuthRedirect({
  profileRole,
  segments,
  session,
}: ResolveAuthRedirectInput) {
  const group = getTopLevelGroup(segments);

  if (!session) {
    return group === "(auth)" ? null : LOGIN_ROUTE;
  }

  if (group === "(auth)") {
    return HOME_ROUTE;
  }

  if (group === "(public)" && profileRole !== "customer") {
    return HOME_ROUTE;
  }

  if (group === "(owner)" && profileRole !== "owner") {
    return HOME_ROUTE;
  }

  if (group === "(customer)" && profileRole !== "customer") {
    return HOME_ROUTE;
  }

  return null;
}
