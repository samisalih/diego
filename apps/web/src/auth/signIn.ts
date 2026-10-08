import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { getSupabase } from "../data/supabaseClient.ts";
import { de } from "../i18n/de.ts";

/** Signs in with email and password; resolves to a German error message or null on success. */
export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  try {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (!error) return null;
    if (isAuthRetryableFetchError(error)) return de.auth.networkError;
    if (isAuthApiError(error) && error.code === "invalid_credentials") return de.auth.invalidCredentials;
    return de.auth.unknownError;
  } catch {
    return de.auth.networkError;
  }
}

/** Signs out; the SIGNED_OUT auth event clears the cached scene (see useSession). */
export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
