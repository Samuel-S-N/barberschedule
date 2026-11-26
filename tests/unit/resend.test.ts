import { createResendSender } from "../../supabase/functions/dispatch-notifications/resend";

const email = { html: "<p>oi</p>", subject: "Assunto", text: "oi", to: "ana@example.com" };

describe("createResendSender", () => {
  it("posts the message with the key and the idempotency key", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    const send = createResendSender({ apiKey: "re_123", fetch: fetchMock as never, from: "Zenc <lembretes@zencpro.app>" });

    expect(await send(email, "outbox-1")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails", {
      body: JSON.stringify({ from: "Zenc <lembretes@zencpro.app>", html: "<p>oi</p>", subject: "Assunto", text: "oi", to: ["ana@example.com"] }),
      headers: { Authorization: "Bearer re_123", "Content-Type": "application/json", "Idempotency-Key": "outbox-1" },
      method: "POST",
    });
  });

  it("logs and skips without a key or sender", async () => {
    const fetchMock = jest.fn();
    const log = jest.fn();

    expect(await createResendSender({ fetch: fetchMock as never, log })(email, "outbox-1")).toEqual({ ok: true, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("RESEND_API_KEY or EMAIL_FROM is not set; skipping e-mail");
  });

  it("reports an HTTP failure so the outbox row is retried", async () => {
    const send = createResendSender({ apiKey: "k", fetch: jest.fn().mockResolvedValue({ ok: false, status: 429 }) as never, from: "z" });

    expect(await send(email, "outbox-1")).toEqual({ error: "Resend HTTP 429", ok: false });
  });

  it("reports a network error", async () => {
    const send = createResendSender({ apiKey: "k", fetch: jest.fn().mockRejectedValue(new Error("offline")) as never, from: "z" });

    expect(await send(email, "outbox-1")).toEqual({ error: "offline", ok: false });
  });
});
