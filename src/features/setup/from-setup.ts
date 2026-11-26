import { useLocalSearchParams, useRouter } from "expo-router";

// The setup checklist opens the existing screens with `?from=setup` (an explicit param, never guessed from the history). Such a screen
// returns to /setup when its own "Salvar" succeeds, and passes the param on to the screen it opens next; opened from the normal panel
// everything behaves as before.
export const FROM_SETUP = { from: "setup" } as const;

export const isFromSetup = (params: { from?: string | string[] }) => params.from === "setup";

export function useFromSetup() {
  const params = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const fromSetup = isFromSetup(params);

  return {
    fromSetup,
    // Extra route params for the next screen: carries `from=setup` along when we were opened from the checklist.
    carry: <T extends Record<string, string>>(next: T) => (fromSetup ? { ...next, ...FROM_SETUP } : next),
    returnToSetup: () => {
      if (fromSetup) router.replace("/setup");
    },
  };
}
