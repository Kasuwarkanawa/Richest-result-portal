import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

let supabaseAdmin;

/**
 * Create the privileged Supabase client lazily. This module must only be
 * imported by backend/server code. Never expose this client or its key to
 * browser bundles or return the key in API responses.
 */
export const getSupabaseAdmin = () => {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: { "X-Client-Info": "rigchest-result-portal-backend" }
      }
    });
  }

  return supabaseAdmin;
};
