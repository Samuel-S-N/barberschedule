export type CompanyKey = "razaoSocial" | "cnpj" | "endereco" | "foro" | "dpoEmail";

// The ONE place with the company's legal data. An empty value renders as its highlighted placeholder in every document.
// Fill the four empty fields before the public launch (docs/hosted-deploy.md has the checklist item).
export const COMPANY: Record<CompanyKey, string> = {
  cnpj: "",
  dpoEmail: "privacidade@zencpro.com.br",
  endereco: "",
  foro: "",
  razaoSocial: "",
};

export const PLACEHOLDER_LABEL: Record<CompanyKey, string> = {
  cnpj: "[CNPJ]",
  dpoEmail: "[E-MAIL DO ENCARREGADO]",
  endereco: "[ENDEREÇO]",
  foro: "[FORO]",
  razaoSocial: "[RAZÃO SOCIAL]",
};
