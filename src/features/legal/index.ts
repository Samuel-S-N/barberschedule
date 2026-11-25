import { privacyDocument } from "./documents/privacy";
import type { LegalDocument, LegalKind } from "./types";

export const LEGAL_DOCUMENTS: Record<LegalKind, LegalDocument> = {
  privacy: privacyDocument,
} as Record<LegalKind, LegalDocument>;

export const LEGAL_VERSIONS = Object.fromEntries(Object.entries(LEGAL_DOCUMENTS).map(([kind, doc]) => [kind, doc.version])) as Record<LegalKind, string>;
