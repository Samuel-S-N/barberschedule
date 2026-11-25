import { COMPANY, PLACEHOLDER_LABEL } from "./company";
import type { CompanyKey } from "./company";

export type Segment = { highlight: boolean; text: string };

const TOKEN = /\{\{(razaoSocial|cnpj|endereco|foro|dpoEmail)\}\}/g;

// "Foro: {{foro}}." -> plain "Foro: ", the value (highlighted placeholder while empty), plain ".".
export function splitSegments(text: string, company: Record<CompanyKey, string> = COMPANY): Segment[] {
  const segments: Segment[] = [];
  let last = 0;

  for (const match of text.matchAll(TOKEN)) {
    const key = match[1] as CompanyKey;
    const value = company[key].trim();

    if (match.index > last) segments.push({ highlight: false, text: text.slice(last, match.index) });
    segments.push(value ? { highlight: false, text: value } : { highlight: true, text: PLACEHOLDER_LABEL[key] });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ highlight: false, text: text.slice(last) });

  return segments.length > 0 ? segments : [{ highlight: false, text }];
}
