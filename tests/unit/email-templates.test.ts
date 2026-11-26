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
    expect(body).toContain("ZENC.");
    expect(body).toContain("<table");
    expect(body).not.toContain("<style");
    expect(body).not.toContain("<img");
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
