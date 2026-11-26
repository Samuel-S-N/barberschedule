import { LEGAL_DOCUMENTS, LEGAL_VERSIONS } from "../../src/features/legal";
import { DPO_EMAIL } from "../../src/features/legal/company";
import type { LegalKind } from "../../src/features/legal/types";

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

  it("ships no template variable and no [PLACEHOLDER] (the official data comes with the lawyer's version)", () => {
    expect(allText(kind)).not.toMatch(/\{\{|\}\}|\[[A-ZÀ-Ú ]{3,}\]|CNPJ|razão social|undefined/i);
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

  it("introduces Zenc by name only", () => {
    expect(allText("privacy")).toContain("A Zenc é uma plataforma de agendamento para estabelecimentos do setor de beleza.");
  });

  it("states the controller / operator split, art. 33 transfer, minors and the 6-month log retention", () => {
    const text = allText("privacy");

    expect(text).toMatch(/controlador/i);
    expect(text).toMatch(/operador/i);
    expect(text).toMatch(/art\. 39/);
    expect(text).toMatch(/art\. 33/);
    expect(text).toMatch(/art\. 14/);
    expect(text).toMatch(/6 \(seis\) meses/);
    expect(text).toContain("privacidade@zencpro.com.br");
    expect(DPO_EMAIL).toBe("privacidade@zencpro.com.br");
    for (const processor of ["Supabase", "Cloudflare", "Resend", "Sentry"]) expect(text).toContain(processor);
  });
});

describe("terms of use", () => {
  it("has the required sections and says Zenc is not a party to the service", () => {
    expect(LEGAL_DOCUMENTS.terms.sections.map((section) => section.id)).toEqual([
      "definicoes", "conta", "uso", "servico-prestado", "obrigacoes-estabelecimento", "responsabilidade",
      "suspensao-encerramento", "privacidade", "alteracoes", "lei-foro",
    ]);
    expect(allText("terms")).toMatch(/não é parte/i);
    expect(allText("terms")).toMatch(/18 anos/);
    expect(allText("terms")).toMatch(/Código de Defesa do Consumidor/);
    expect(allText("terms")).toContain("Zenc: a plataforma de agendamento.");
    expect(allText("terms")).toContain("Estes Termos seguem a lei brasileira. Conflitos serão resolvidos no foro do domicílio do usuário.");
  });
});

describe("business agreement", () => {
  it("has the commercial and operator clauses", () => {
    expect(LEGAL_DOCUMENTS.business.sections.map((section) => section.id)).toEqual([
      "objeto", "preco", "obrigacoes-estabelecimento", "papeis-dados", "instrucoes-confidencialidade", "suboperadores",
      "seguranca-incidentes", "direitos-titulares", "devolucao-eliminacao", "responsabilidade", "vigencia-rescisao", "lei-foro",
    ]);
    const text = allText("business");

    expect(text).toContain("A Zenc fornece ao estabelecimento que aceita este Contrato (\"Estabelecimento\")");
    expect(text).toContain("Este Contrato segue a lei brasileira. Fica eleito o foro do domicílio do Estabelecimento.");
    expect(text).toMatch(/primeiro mês/i);
    expect(text).toMatch(/proposta comercial/i);
    expect(text).toMatch(/48 \(quarenta e oito\) horas/);
    expect(text).toMatch(/Resolução CD\/ANPD nº 15\/2024/);
    expect(text).toMatch(/3 \(três\) dias úteis/);
  });
});
