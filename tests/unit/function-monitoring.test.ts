import { createReporter, parseDsn, withMonitoring } from "../../supabase/functions/_shared/monitoring";

const dsn = "https://abc123@o42.ingest.de.sentry.io/7";

describe("parseDsn", () => {
  it("reads key, host and project", () => {
    expect(parseDsn(dsn)).toEqual({ host: "o42.ingest.de.sentry.io", key: "abc123", project: "7" });
  });
  it("returns null for anything else", () => {
    expect(parseDsn("")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });
});

describe("createReporter", () => {
  const sent: Array<{ body: string; headers: Record<string, string>; url: string }> = [];
  const send = jest.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
    sent.push({ body: init.body, headers: init.headers, url });

    return new Response("{}", { status: 200 });
  });
  const report = createReporter({ dsn, environment: "dev", fetch: send as never, id: () => "e".repeat(32), now: () => new Date("2026-11-26T12:00:00Z") });

  beforeEach(() => {
    sent.length = 0;
    send.mockClear();
  });

  it("posts one envelope to the project's endpoint with the key", async () => {
    await report(new Error("boom for ana@example.com"), { function: "dispatch-notifications" });

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://o42.ingest.de.sentry.io/api/7/envelope/");
    expect(sent[0].headers["X-Sentry-Auth"]).toContain("sentry_key=abc123");
    const [header, item, event] = sent[0].body.split("\n").map((line) => JSON.parse(line));

    expect(header.event_id).toBe("e".repeat(32));
    expect(item.type).toBe("event");
    expect(event).toMatchObject({ environment: "dev", level: "error", platform: "javascript", tags: { function: "dispatch-notifications" } });
    expect(event.exception.values[0].value).toBe("boom for [email]");
    expect(JSON.stringify(event)).not.toContain("ana@example.com");
  });

  it("never throws, even when Sentry is unreachable", async () => {
    send.mockRejectedValueOnce(new Error("offline"));
    await expect(report(new Error("x"))).resolves.toBeUndefined();
  });

  it("does nothing without a DSN", async () => {
    const quiet = createReporter({ dsn: undefined, environment: "dev", fetch: send as never });

    await quiet(new Error("x"));
    expect(send).not.toHaveBeenCalled();
  });
});

describe("withMonitoring", () => {
  it("reports a thrown error and answers 500 without leaking the message", async () => {
    const report = jest.fn(async () => undefined);
    const handler = withMonitoring(async () => {
      throw new Error("secret detail");
    }, report);
    const response = await handler(new Request("https://x.test/", { method: "POST" }));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret detail");
    expect(report).toHaveBeenCalledTimes(1);
  });
  it("passes a normal response through", async () => {
    const handler = withMonitoring(async () => new Response("ok"), jest.fn(async () => undefined));

    expect(await (await handler(new Request("https://x.test/"))).text()).toBe("ok");
  });
});
