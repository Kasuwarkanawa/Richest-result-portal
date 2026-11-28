-- PROPOSAL ONLY — DO NOT APPLY TO ANY DATABASE WITHOUT EXPLICIT APPROVAL.
-- Target: RIGCHEST-RESULT-PORTAL (qqvbsykhkxwarsdjantc)
-- Purpose: make frozen publication record rows immutable after insertion.
--
-- Apply only after reviewing retention, backup and operational recovery needs.
-- This trigger intentionally blocks UPDATE and DELETE for every role, including
-- service_role. A future correction must create a new snapshot/version rather
-- than mutate historical result payloads.

BEGIN;

CREATE OR REPLACE FUNCTION public.reject_published_snapshot_record_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RAISE EXCEPTION
    'Published snapshot records are immutable; create a new snapshot version'
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS published_snapshot_records_immutable
  ON public.published_result_snapshot_records;

CREATE TRIGGER published_snapshot_records_immutable
BEFORE UPDATE OR DELETE
ON public.published_result_snapshot_records
FOR EACH ROW
EXECUTE FUNCTION public.reject_published_snapshot_record_mutation();

COMMIT;

-- Verification required in a disposable PostgreSQL 17 database before review:
-- 1. INSERT a RESULT and SUMMARY record: both must succeed.
-- 2. UPDATE payload: must fail with SQLSTATE 55000.
-- 3. DELETE either record: must fail with SQLSTATE 55000.
-- 4. Confirm failed mutations leave original payload and row count unchanged.
-- 5. Confirm publication and rollback RPC integration tests still pass.
-- 6. Confirm application code never attempts to edit/delete frozen records.
--
-- This file is a review proposal only. It has NOT been installed on Supabase.
