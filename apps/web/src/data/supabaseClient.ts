import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { platform } from "../platform/index.ts";

let client: SupabaseClient | null = null;

/** The one Supabase client of the app, created on first use so fixture mode never touches it. */
export function getSupabase(): SupabaseClient {
  client ??= createClient(platform.config.supabaseUrl, platform.config.supabaseAnonKey);
  return client;
}
