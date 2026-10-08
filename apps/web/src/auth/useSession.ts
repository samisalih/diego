import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { resetSceneOnSignOut } from "../data/sceneCache.ts";
import { getSupabase } from "../data/supabaseClient.ts";

/** The current Supabase session: `undefined` while it is being restored, `null` when signed out. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const client = getSupabase();
    void client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") resetSceneOnSignOut();
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}
