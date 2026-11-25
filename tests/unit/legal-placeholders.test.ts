import { COMPANY, PLACEHOLDER_LABEL } from "../../src/features/legal/company";
import { splitSegments } from "../../src/features/legal/placeholders";

const empty = { cnpj: "", dpoEmail: "privacidade@zencpro.com.br", endereco: "", foro: "", razaoSocial: "" };

describe("splitSegments", () => {
  it("keeps plain text as one plain segment", () => {
    expect(splitSegments("Sem variáveis.", empty)).toEqual([{ highlight: false, text: "Sem variáveis." }]);
  });

  it("renders an empty company value as its highlighted placeholder", () => {
    expect(splitSegments("Operada por {{razaoSocial}}, CNPJ {{cnpj}}.", empty)).toEqual([
      { highlight: false, text: "Operada por " },
      { highlight: true, text: "[RAZÃO SOCIAL]" },
      { highlight: false, text: ", CNPJ " },
      { highlight: true, text: "[CNPJ]" },
      { highlight: false, text: "." },
    ]);
  });

  it("renders a filled value as plain text", () => {
    expect(splitSegments("Foro: {{foro}}.", { ...empty, foro: "Comarca de São Paulo/SP" })).toEqual([
      { highlight: false, text: "Foro: " },
      { highlight: false, text: "Comarca de São Paulo/SP" },
      { highlight: false, text: "." },
    ]);
  });

  it("the shipped company file only leaves the four legal fields empty", () => {
    expect(Object.entries(COMPANY).filter(([, value]) => value === "").map(([key]) => key).sort()).toEqual(["cnpj", "endereco", "foro", "razaoSocial"]);
    expect(PLACEHOLDER_LABEL.endereco).toBe("[ENDEREÇO]");
  });
});
