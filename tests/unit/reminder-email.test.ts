import { buildReminderEmail } from "../../supabase/functions/dispatch-notifications/email";

const payload = {
  professional_name: "Ana",
  service_name: "Corte",
  shop_address: "Rua das Flores 120, Centro, Campinas - SP",
  shop_name: "Studio Aurora",
  shop_timezone: "America/Sao_Paulo",
  starts_at: "2026-11-27T17:30:00Z",
};

describe("buildReminderEmail", () => {
  const email = buildReminderEmail(payload, "https://studio-aurora.zencpro.app/appointments");

  it("puts the local time, service, professional and business in the subject", () => {
    expect(email.subject).toBe("Lembrete: amanhã às 14:30, Corte com Ana em Studio Aurora");
  });

  it("shows the wordmark image with an absolute https URL and styled alt text", () => {
    const images = email.html.match(/<img [^>]*>/g) ?? [];

    expect(images).toHaveLength(1);
    expect(images[0]).toContain('src="https://zencpro.app/email/zenc-logo.png"');
    expect(images[0]).toContain('alt="ZENC."');
    expect(images[0]).toContain('width="119"');
    expect(images[0]).toContain('height="48"');
    expect(images[0]).toMatch(/style="[^"]*display:block;[^"]*border:0;/);
  });

  it("shows the address, the button and the opt-out footer", () => {
    expect(email.html).toContain("Rua das Flores 120, Centro, Campinas - SP");
    expect(email.html).toContain('href="https://studio-aurora.zencpro.app/appointments"');
    expect(email.html).toContain("Ver meus agendamentos");
    expect(email.html).toContain("Para não receber, desative em Configurações &gt; Notificações.");
    expect(email.text).toContain("Para não receber, desative em Configurações > Notificações.");
    expect(email.text).toContain("https://studio-aurora.zencpro.app/appointments");
  });

  it("says it is automatic and sends questions to the business through the app, in html and text", () => {
    const notice = "Este e-mail é automático. Para falar com o estabelecimento, use o contato dele no app.";

    expect(email.html).toContain(notice);
    expect(email.text).toContain(notice);
    expect(email.text.endsWith(notice)).toBe(true);
  });

  it("takes the logo URL from the environment (hosted dev serves it from its own site) and keeps the production address by default", () => {
    const dev = buildReminderEmail(payload, "https://x/appointments", "https://zenc-web-dev.zenc.workers.dev/email/zenc-logo.png");

    expect(dev.html).toContain('src="https://zenc-web-dev.zenc.workers.dev/email/zenc-logo.png"');
    expect(dev.html).not.toContain("https://zencpro.app/email/zenc-logo.png");
    expect(email.html).toContain('src="https://zencpro.app/email/zenc-logo.png"');
    expect(buildReminderEmail(payload, "https://x/appointments", "").html).toContain('src="https://zencpro.app/email/zenc-logo.png"');
  });

  it("escapes the logo URL", () => {
    expect(buildReminderEmail(payload, "https://x/appointments", 'https://a/"><script>').html).not.toContain("<script>");
  });

  it("uses the shop's time zone", () => {
    const manaus = buildReminderEmail({ ...payload, shop_timezone: "America/Manaus" }, "https://x.zencpro.app/appointments");

    expect(manaus.subject).toContain("às 13:30");
  });

  it("escapes names", () => {
    const evil = buildReminderEmail({ ...payload, shop_name: "<b>Studio</b> & Co" }, "https://x.zencpro.app/appointments");

    expect(evil.html).toContain("&lt;b&gt;Studio&lt;/b&gt; &amp; Co");
    expect(evil.html).not.toContain("<b>Studio</b>");
  });

  it("leaves out the address line when there is none and never says barbearia", () => {
    const bare = buildReminderEmail({ ...payload, shop_address: "" }, "https://x.zencpro.app/appointments");

    expect(bare.html).not.toContain("Endereço");
    expect(email.html).not.toMatch(/barbearia/i);
    expect(email.html).not.toMatch(/Ă|Ã§|Ã£/);
  });
});
