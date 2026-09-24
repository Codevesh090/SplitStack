import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

const supabaseUrl = process.env["SUPABASE_URL"];
const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set.",
  );
}

/**
 * Typed Supabase client scoped to the SplitStack database schema.
 * Import this wherever database access is needed — never instantiate
 * a second client.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
