import { createSupabaseReadOnlyAuditAdapters } from "./supabaseReadOnlyAudit.js";
import { buildCountReconciliationReport } from "./countReconciliationReport.js";

/**
 * Execute a count-only reconciliation using explicitly injected database
 * adapters. No credentials, clients, or connections are created here.
 */
export const runSupabaseCountReconciliation = async ({ models, request } = {}) => {
  const audit = createSupabaseReadOnlyAuditAdapters({ models, request });
  const counts = await audit.countAll();
  return buildCountReconciliationReport(counts);
};
