import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../services/supabase";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return undefined; }
    let alive = true;
    const loadProfile = async (user) => {
      if (!user) { if (alive) setProfile(null); return; }
      const { data } = await supabase.from("profiles").select("id, full_name, role").eq("id", user.id).maybeSingle();
      if (alive) setProfile(data || { id: user.id, full_name: user.user_metadata?.full_name || user.email, role: "pending" });
    };
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user);
      if (alive) setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      queueMicrotask(() => loadProfile(next?.user));
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const value = useMemo(() => ({ session, user: session?.user || null, profile, loading, configured: supabaseConfigured,
    signOut: async () => { if (supabase) await supabase.auth.signOut(); } }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
