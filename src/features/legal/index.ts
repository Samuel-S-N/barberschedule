import { businessDocument } from "./documents/business";
import { privacyDocument } from "./documents/privacy";
import { termsDocument } from "./documents/terms";
import type { LegalDocument, LegalKind } from "./types";

export const LEGAL_DOCUMENTS: Record<LegalKind, LegalDocument> = {
  business: businessDocument,
  privacy: privacyDocument,
  terms: termsDocument,
};

export const LEGAL_VERSIONS = Object.fromEntries(Object.entries(LEGAL_DOCUMENTS).map(([kind, doc]) => [kind, doc.version])) as Record<LegalKind, string>;

// Public documents: they stay reachable everywhere, even on a shop page that is closed to visitors.
export const LEGAL_PATHS = ["/privacidade", "/termos", "/contrato"];
