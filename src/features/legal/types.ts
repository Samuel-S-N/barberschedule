export type LegalKind = "privacy" | "terms" | "business";
export type LegalSection = { id: string; paragraphs: string[]; title: string };
// `version` is an ISO date: bump it when the text changes in a way users must accept again.
export type LegalDocument = { kind: LegalKind; sections: LegalSection[]; title: string; version: string };
