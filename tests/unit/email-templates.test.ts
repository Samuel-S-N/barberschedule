import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..");
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8");
const templates = ["confirmation", "recovery", "email_change", "invite"] as const;
const html = (name: string) => readFileSync(join(root, "supabase", "templates", `${name}.html`), "utf8");

describe.each(templates)("%s template", (name) => {
  const body = html(name);

  it("is Portuguese, branded, email-safe and has a button plus a fallback link", () => {
    expect(body).toContain('lang="pt-BR"');
    expect(body).toContain("<table");
    expect(body).not.toContain("<style");
    expect(body.match(/\{\{ \.ConfirmationURL \}\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(body).toContain("Se o botão não funcionar");
  });

  it("has no English copy, no mojibake and never says barbearia", () => {
    expect(body).not.toMatch(/Confirm your|Reset your|Click|Hello|Follow this link|You have been invited|If you didn/i);
    expect(body).not.toMatch(/Ă|Ã§|Ã£|Ã©/);
    expect(body).not.toMatch(/barbearia|barbershop/i);
  });

  it("is wired in config.toml with a Portuguese subject and an existing file", () => {
    const section = config.split(`[auth.email.template.${name}]`)[1]?.split("\n[")[0] ?? "";

    expect(section).toMatch(/subject = ".*(Zenc).*"/);
    expect(section).toContain(`content_path = "./supabase/templates/${name}.html"`);
    expect(existsSync(join(root, "supabase", "templates", `${name}.html`))).toBe(true);
  });
});

describe.each(templates)("%s template logo", (name) => {
  it("shows the wordmark image from the web app's static files, with readable alt text for clients that block images", () => {
    const images = html(name).match(/<img [^>]*>/g) ?? [];

    expect(images).toHaveLength(1);
    expect(images[0]).toContain('src="https://zencpro.app/email/zenc-logo.png"');
    expect(images[0]).toContain('alt="ZENC."');
    expect(images[0]).toContain('width="119"');
    expect(images[0]).toContain('height="48"');
    expect(images[0]).toMatch(/style="[^"]*display:block;[^"]*border:0;/);
    // The alt text is styled like the wordmark, so a blocked image still reads as the name.
    expect(images[0]).toMatch(/font-weight:700/);
  });
});

describe("the logo file", () => {
  it("is a transparent PNG at 2x of its display size, served from public/", () => {
    const file = readFileSync(join(root, "public", "email", "zenc-logo.png"));

    expect(file.subarray(1, 4).toString()).toBe("PNG");
    expect(file.readUInt32BE(16)).toBe(238);
    expect(file.readUInt32BE(20)).toBe(96);
    // color type 6: RGBA, so the background is transparent.
    expect(file[25]).toBe(6);
  });
});

describe("template specifics", () => {
  it("account e-mails name no business", () => {
    for (const name of ["confirmation", "recovery", "email_change"]) expect(html(name)).not.toContain("business_name");
  });

  it("the invite names the business", () => {
    expect(html("invite")).toContain("Você foi convidado para {{ .Data.business_name }} na Zenc");
  });

  it("the e-mail change shows the new address", () => {
    expect(html("email_change")).toContain("{{ .NewEmail }}");
  });

  it("the recovery template talks about the password", () => {
    expect(html("recovery")).toContain("Redefinir senha");
  });
});
