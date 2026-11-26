import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useSupabaseSession } from "../../providers/AppProviders";
import { acceptLegalDocuments } from "./api";
import { consentsQueryKey } from "./use-pending-legal";
import type { LegalKind } from "./types";

// The ONE way to accept legal documents from the app (the re-accept gate and the setup checklist's agreement step): it records the
// consent and refreshes the consents the gate reads, so a document accepted here is never asked for again from a stale list.
export function useAcceptLegal(onAccepted?: () => void) {
  const queryClient = useQueryClient();
  const { session, supabase } = useSupabaseSession();

  return useMutation({
    mutationFn: (kinds: LegalKind[]) => acceptLegalDocuments(supabase, kinds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: consentsQueryKey(session?.user.id) });
      onAccepted?.();
    },
  });
}
