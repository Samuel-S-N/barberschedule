import * as Sentry from "@sentry/react-native";

import { scrubBreadcrumb, scrubEvent } from "../../../supabase/functions/_shared/scrub";

let started = false;

// Errors only: no tracing, no replay, no personal data (scrubEvent). Without a DSN (local, tests) the SDK is never started.
// Expo inlines `process.env.EXPO_PUBLIC_*` only for literal property reads, so each variable is read by name.
export function initMonitoring(): boolean {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) return false;
  Sentry.init({
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV || "dev",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  started = true;

  return true;
}

export const withMonitoring = <T>(component: T): T => (started ? (Sentry.wrap(component as never) as T) : component);
