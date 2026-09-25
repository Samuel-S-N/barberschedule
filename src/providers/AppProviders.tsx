import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import React, {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AppState } from "react-native";
import { I18nextProvider } from "react-i18next";

import { getCurrentProfile } from "../features/auth/api";
import i18n, { syncLanguage } from "../i18n";
import type { Profile } from "../features/auth/types";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type SessionContextValue = {
  isLoading: boolean;
  profile: Profile | null;
  session: Session | null;
  supabase: SupabaseClient;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const syncSequence = useRef(0);

  useEffect(() => {
    let active = true;

    const syncSession = async (nextSession: Session | null) => {
      if (!active) {
        return;
      }

      const currentSync = syncSequence.current + 1;
      syncSequence.current = currentSync;

      setIsLoading(true);
      setSession(nextSession);
      setProfile(null);

      if (!nextSession) {
        if (currentSync === syncSequence.current) {
          setIsLoading(false);
        }

        return;
      }

      try {
        const nextProfile = await getCurrentProfile(supabase);

        if (active && currentSync === syncSequence.current) {
          setProfile(nextProfile);
        }
      } catch {
        if (active && currentSync === syncSequence.current) {
          setProfile(null);
        }
      } finally {
        if (active && currentSync === syncSequence.current) {
          setIsLoading(false);
        }
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      void syncSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void syncSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncLanguage();
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider
          value={{ isLoading, profile, session, supabase }}
        >
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

export function useSupabaseSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSupabaseSession must be used inside AppProviders");
  }

  return context;
}
