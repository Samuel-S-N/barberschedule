import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";
import { LEGAL_VERSIONS } from "./index";
import type { Consent } from "./pending";
import type { LegalKind } from "./types";

export async function listMyConsents(supabase: Pick<SupabaseClient, "from">): Promise<Consent[]> {
  const { data, error } = await supabase.from("consents").select("kind, version");

  if (error) throw toDomainError(error);

  return (data ?? []) as Consent[];
}

export async function acceptLegalDocuments(supabase: Pick<SupabaseClient, "rpc">, kinds: LegalKind[]) {
  const { error } = await supabase.rpc("accept_legal_documents", { p_documents: kinds.map((kind) => ({ kind, version: LEGAL_VERSIONS[kind] })) });

  if (error) throw toDomainError(error);
}
