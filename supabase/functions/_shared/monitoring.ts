import { scrubEvent, scrubText } from "./scrub.ts";

type Send = (url: string, init: { body: string; headers: Record<string, string>; method: string }) => Promise<Response>;

export function parseDsn(dsn: string | undefined): { host: string; key: string; project: string } | null {
  try {
    const url = new URL(dsn ?? "");
    const project = url.pathname.replace(/^\/+/, "");

    return url.username && project ? { host: url.host, key: url.username, project } : null;
  } catch {
    return null;
  }
}

// Errors only, no SDK: one POST of one envelope per error (Sentry's documented envelope format). Reporting must never break the
// function it observes, so every failure is swallowed. (The Deno SDK is not used: it needs a newer Deno than the Supabase edge
// runtime reports and does not scope per request in Deno.serve, so for errors-only it would add risk and no information.)
export function createReporter({ dsn, environment, fetch: send = fetch as Send, id = () => crypto.randomUUID().replaceAll("-", ""), now = () => new Date() }: {
  dsn: string | undefined;
  environment: string;
  fetch?: Send;
  id?: () => string;
  now?: () => Date;
}) {
  const target = parseDsn(dsn);

  return async (error: unknown, tags: Record<string, string> = {}): Promise<void> => {
    if (!target) return;
    try {
      const eventId = id();
      const err = error instanceof Error ? error : new Error(String(error));
      const event = scrubEvent({
        environment,
        event_id: eventId,
        exception: { values: [{ type: err.name, value: err.message }] },
        extra: { stack: scrubText(err.stack ?? "") },
        level: "error",
        platform: "javascript",
        tags,
        timestamp: now().toISOString(),
      });
      const body = [JSON.stringify({ event_id: eventId, sent_at: now().toISOString() }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");

      await send(`https://${target.host}/api/${target.project}/envelope/`, {
        body,
        headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${target.key}` },
        method: "POST",
      });
    } catch {
      // Sentry down or blocked: nothing to do.
    }
  };
}

export const withMonitoring = (handler: (request: Request) => Promise<Response> | Response, report: ReturnType<typeof createReporter>) =>
  async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      await report(error);

      return Response.json({ code: "INTERNAL_ERROR" }, { status: 500 });
    }
  };
