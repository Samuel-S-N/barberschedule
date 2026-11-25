import { privacyDocument } from "./documents/privacy";
import { termsDocument } from "./documents/terms";
import type { LegalDocument, LegalKind } from "./types";

export const LEGAL_DOCUMENTS: Record<LegalKind, LegalDocument> = {
  privacy: privacyDocument,
  terms: termsDocument,
} as Record<LegalKind, LegalDocument>;

export const LEGAL_VERSIONS = Object.fromEntries(Object.entries(LEGAL_DOCUMENTS).map(([kind, doc]) => [kind, doc.version])) as Record<LegalKind, string>;
