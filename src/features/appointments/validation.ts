import { z } from "zod";

const lifecycleStartSchema = z.string().datetime({ offset: true });

export function parseLifecycleStart(startsAt: string) {
  return lifecycleStartSchema.parse(startsAt);
}

export function isLifecycleWindowOpen(startsAt: string, now: Date) {
  return new Date(parseLifecycleStart(startsAt)).getTime() - now.getTime() >= 90 * 60 * 1000;
}
