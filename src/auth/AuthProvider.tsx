import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Tables } from "../types/database";

type AppUser = Tables<"app_users">;

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  profile: AppUser | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadProfile(nextSession: Session | null) {
      if (!nextSession?.user.id) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("app_users")
        .select("*")
        .eq("auth_user_id", nextSession.user.id)
        .maybeSingle();

      if (error) {
        console.error("Unable to read app user profile", error);
        setProfile(null);
        return;
      }

      setProfile(data);
    }

    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!active) {
          return;
        }

        if (error) {
          console.error("Unable to read Supabase session", error);
        }

        setSession(data.session);
        await loadProfile(data.session);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession).finally(() => setLoading(false));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      profile,
      signOut: async () => {
        const { error } = await supabase.auth.signOut();

        if (error) {
          throw error;
        }
      },
    }),
    [loading, session, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
