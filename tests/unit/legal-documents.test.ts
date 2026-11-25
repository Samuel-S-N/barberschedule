import { LEGAL_DOCUMENTS, LEGAL_VERSIONS } from "../../src/features/legal";
import type { LegalKind } from "../../src/features/legal/types";

const TOKENS = /\{\{(razaoSocial|cnpj|endereco|foro|dpoEmail)\}\}/g;
const allText = (kind: LegalKind) => LEGAL_DOCUMENTS[kind].sections.flatMap((section) => [section.title, ...section.paragraphs]).join("\n");

describe.each(Object.keys(LEGAL_DOCUMENTS) as LegalKind[])("%s document", (kind) => {
  const doc = LEGAL_DOCUMENTS[kind];

  it("has an ISO-date version that matches LEGAL_VERSIONS", () => {
    expect(doc.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LEGAL_VERSIONS[kind]).toBe(doc.version);
  });

  it("has unique section ids, titles and non-empty paragraphs", () => {
    const ids = doc.sections.map((section) => section.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const section of doc.sections) {
      expect(section.title.trim()).not.toBe("");
      expect(section.paragraphs.length).toBeGreaterThan(0);
      for (const paragraph of section.paragraphs) expect(paragraph.trim()).not.toBe("");
    }
  });

  it("never says barbearia / barbershop and has no mojibake", () => {
    expect(allText(kind)).not.toMatch(/barbearia|barbershop|barbeiro/i);
    expect(allText(kind)).not.toMatch(/Ă|Ã§|Ã£|Ã©|Â/);
  });

  it("only uses known company tokens", () => {
    const stray = allText(kind).replace(TOKENS, "").match(/\{\{.*?\}\}/g);

    expect(stray).toBeNull();
  });
});

describe("privacy policy", () => {
  const ids = LEGAL_DOCUMENTS.privacy.sections.map((section) => section.id);

  it("covers every item the LGPD checklist requires", () => {
    expect(ids).toEqual([
      "quem-somos", "papeis", "dados", "finalidades-bases", "compartilhamento", "operadores-transferencia", "retencao",
      "seguranca", "cookies", "direitos", "menores", "encarregado", "incidentes", "alteracoes",
    ]);
  });

  it("states the controller / operator split, art. 33 transfer, minors and the 6-month log retention", () => {
    const text = allText("privacy");

    expect(text).toMatch(/controlador/i);
    expect(text).toMatch(/operador/i);
    expect(text).toMatch(/art\. 39/);
    expect(text).toMatch(/art\. 33/);
    expect(text).toMatch(/art\. 14/);
    expect(text).toMatch(/6 \(seis\) meses/);
    expect(text).toMatch(/privacidade@zencpro\.com\.br|\{\{dpoEmail\}\}/);
    for (const processor of ["Supabase", "Cloudflare", "Resend", "Sentry"]) expect(text).toContain(processor);
  });
});
