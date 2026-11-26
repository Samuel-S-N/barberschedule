import type { Email } from "./email.ts";

export type OutgoingEmail = Email & { to: string };
export type EmailSendResult = { error?: string; ok: boolean; skipped?: boolean };

type Options = { apiKey?: string; fetch?: typeof fetch; from?: string; log?: (message: string) => void };

// Resend HTTP API. The Idempotency-Key (the outbox id) makes a retry after a crash between "sent" and "marked sent" harmless.
export function createResendSender({ apiKey, fetch: send = fetch, from, log = console.warn }: Options) {
  return async (email: OutgoingEmail, idempotencyKey: string): Promise<EmailSendResult> => {
    if (!apiKey || !from) {
      log("RESEND_API_KEY or EMAIL_FROM is not set; skipping e-mail");
      return { ok: true, skipped: true };
    }

    try {
      const response = await send("https://api.resend.com/emails", {
        body: JSON.stringify({ from, html: email.html, subject: email.subject, text: email.text, to: [email.to] }),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        method: "POST",
      });

      return response.ok ? { ok: true } : { error: `Resend HTTP ${response.status}`, ok: false };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Resend request failed", ok: false };
    }
  };
}
