import { createReadOnlyAuditAdapters } from "./readOnlyAuditAdapters.js";
import { createSupabaseCountFunction } from "./supabaseCountAdapter.js";

/**
 * Compose MongoDB count-only reads with Supabase exact-count requests.
 * All dependencies are injected; this module does not connect to either DB.
 */
export const createSupabaseReadOnlyAuditAdapters = ({ models, request } = {}) => {
  const countTargetRows = createSupabaseCountFunction({ request });
  return createReadOnlyAuditAdapters({ models, countTargetRows });
};
