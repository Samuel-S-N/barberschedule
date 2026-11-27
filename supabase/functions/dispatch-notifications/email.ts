export type ReminderPayload = {
  professional_name?: string;
  service_name?: string;
  shop_address?: string;
  shop_name?: string;
  shop_timezone?: string;
  starts_at?: string;
};
export type Email = { html: string; subject: string; text: string };

// The wordmark image is a static file of the web app (public/email/zenc-logo.png, rendered by scripts/render-email-logo.mjs). Production
// serves it at zencpro.app; hosted dev serves it from its own site, so EMAIL_LOGO_URL (function secret) overrides the address there. The alt
// text is styled like the wordmark for clients that block images.
export const DEFAULT_LOGO_URL = "https://zencpro.app/email/zenc-logo.png";

const logoImage = (url: string) => `<img src="${escapeHtml(url)}" width="119" height="48" alt="ZENC." style="display:block;border:0;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:700;letter-spacing:2px;line-height:48px;color:#171412;">`;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function localTime(startsAt: string | undefined, timeZone: string | undefined): string {
  const date = startsAt ? new Date(startsAt) : null;

  if (!date || Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", hour12: false, minute: "2-digit", timeZone: timeZone || "America/Sao_Paulo" }).format(date);
}

// "Lembrete: amanhã às HH:MM, <serviço> com <profissional> em <estabelecimento>". Portuguese only for now.
export function buildReminderEmail(payload: ReminderPayload, appointmentsUrl: string, logoUrl?: string): Email {
  const service = payload.service_name?.trim() || "Agendamento";
  const professional = payload.professional_name?.trim();
  const shop = payload.shop_name?.trim() || "seu estabelecimento";
  const address = payload.shop_address?.trim();
  const time = localTime(payload.starts_at, payload.shop_timezone);
  const headline = `Lembrete: amanhã${time ? ` às ${time}` : ""}, ${service}${professional ? ` com ${professional}` : ""} em ${shop}`;
  const optOut = "Para não receber, desative em Configurações > Notificações.";
  const automatic = "Este e-mail é automático. Para falar com o estabelecimento, use o contato dele no app.";
  const cell = "font-family:Arial,Helvetica,sans-serif;color:#4A4036;";
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(headline)}</title></head>
<body style="margin:0;padding:0;background-color:#F6F1E9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F1E9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background-color:#FFFFFF;border-radius:20px;">
<tr><td style="padding:32px 32px 8px 32px;">${logoImage(logoUrl || DEFAULT_LOGO_URL)}</td></tr>
<tr><td style="padding:8px 32px 0 32px;${cell}font-size:20px;font-weight:700;color:#1F1A14;">${escapeHtml(headline)}</td></tr>
${address ? `<tr><td style="padding:12px 32px 0 32px;${cell}font-size:16px;line-height:24px;">Endereço: ${escapeHtml(address)}</td></tr>\n` : ""}<tr><td style="padding:24px 32px 8px 32px;"><a href="${escapeHtml(appointmentsUrl)}" style="display:inline-block;background-color:#DB9A34;color:#1F1A14;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:14px;">Ver meus agendamentos</a></td></tr>
<tr><td style="padding:16px 32px 12px 32px;${cell}font-size:13px;line-height:20px;color:#6B5F52;">${escapeHtml(optOut)}</td></tr>
<tr><td style="padding:0 32px 32px 32px;${cell}font-size:13px;line-height:20px;color:#6B5F52;">${automatic}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  const text = [headline, address ? `Endereço: ${address}` : "", `Ver meus agendamentos: ${appointmentsUrl}`, optOut, automatic].filter(Boolean).join("\n\n");

  return { html, subject: headline, text };
}
