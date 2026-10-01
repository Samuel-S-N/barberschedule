import { z } from "zod";

const lifecycleStartSchema = z.string().datetime({ offset: true });

export function parseLifecycleStart(startsAt: string) {
  return lifecycleStartSchema.parse(startsAt);
}

// Keep in sync with `interval '90 minutes'` in supabase/migrations/0014 (guarded by a contract test).
export const LIFECYCLE_LOCK_MINUTES = 90;

export function isLifecycleWindowOpen(startsAt: string, now: Date) {
  return new Date(parseLifecycleStart(startsAt)).getTime() - now.getTime() >= LIFECYCLE_LOCK_MINUTES * 60 * 1000;
}
