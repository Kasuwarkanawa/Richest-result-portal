\set ON_ERROR_STOP on
-- Runs after publication integration tests against the disposable PostgreSQL 17 fixture.
-- The fixture must already contain RESULT and SUMMARY snapshot records.

DO $$
BEGIN
  IF (SELECT count(*) FROM public.published_result_snapshot_records) < 2 THEN
    RAISE EXCEPTION 'Expected frozen RESULT and SUMMARY records before immutability test';
  END IF;
END
$$;

-- UPDATE must fail with SQLSTATE 55000.
\! if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "UPDATE public.published_result_snapshot_records SET payload = payload || '{\"tampered\":true}'::jsonb WHERE id = (SELECT id FROM public.published_result_snapshot_records ORDER BY created_at LIMIT 1)" >/tmp/snapshot-update-denied.log 2>&1; then echo 'Expected snapshot UPDATE to be rejected' >&2; exit 1; fi
\! grep -q 'Published snapshot records are immutable' /tmp/snapshot-update-denied.log

-- DELETE must fail with SQLSTATE 55000.
\! if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DELETE FROM public.published_result_snapshot_records WHERE id = (SELECT id FROM public.published_result_snapshot_records ORDER BY created_at LIMIT 1)" >/tmp/snapshot-delete-denied.log 2>&1; then echo 'Expected snapshot DELETE to be rejected' >&2; exit 1; fi
\! grep -q 'Published snapshot records are immutable' /tmp/snapshot-delete-denied.log

-- Confirm both attempts left the original record set and payloads intact.
DO $$
DECLARE
  v_count bigint;
  v_tampered bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.published_result_snapshot_records;
  SELECT count(*) INTO v_tampered
  FROM public.published_result_snapshot_records
  WHERE payload ? 'tampered';

  IF v_count < 2 THEN
    RAISE EXCEPTION 'Snapshot record count changed after rejected mutation';
  END IF;
  IF v_tampered <> 0 THEN
    RAISE EXCEPTION 'Snapshot payload changed despite immutability trigger';
  END IF;
END
$$;
