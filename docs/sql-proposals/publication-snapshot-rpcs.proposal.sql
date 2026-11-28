-- PROPOSAL ONLY — DO NOT APPLY TO ANY DATABASE WITHOUT EXPLICIT APPROVAL.
-- Target: RIGCHEST-RESULT-PORTAL (qqvbsykhkxwarsdjantc)
-- Repository: Kasuwarkanawa/Richest-result-portal
-- Branch: migration/supabase-postgres
--
-- Purpose:
--   Provide transactionally atomic publication and rollback operations.
--   This file is intentionally stored under docs/sql-proposals/, NOT supabase/migrations/.
--
-- Security model:
--   * SECURITY INVOKER: caller privileges and RLS remain in force.
--   * The backend calls these functions with its server-only service_role credential.
--   * service_role is never sent to a browser.
--   * Application routes must continue enforcing SUPER_ADMIN / EXAM_CELL_ADMIN
--     for publish and rollback. The actor UUID is audited, not trusted as authorization.
--   * EXECUTE is revoked from PUBLIC, anon and authenticated, and granted only to service_role.
--
-- Important design notes:
--   * A single function call is one PostgreSQL transaction.
--   * The exam_sessions row serializes publication/version allocation per session.
--   * Result and summary payloads preserve the original Mongo service's field names.
--   * Frozen payloads are stored in published_result_snapshot_records (storage_version=2);
--     legacy frozen_results/frozen_summaries columns remain empty arrays.
--   * Rollback deliberately does NOT reactivate older SUPERSEDED snapshots.
--   * No statement in this proposal has been applied to Supabase.

BEGIN;

CREATE OR REPLACE FUNCTION public.publish_exam_session_snapshot(
  p_exam_session_id uuid,
  p_actor_user_id uuid,
  p_notes text DEFAULT ''
)
RETURNS TABLE(snapshot_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_session public.exam_sessions%ROWTYPE;
  v_eligible_count bigint;
  v_result_count bigint;
  v_missing_summary_count bigint;
  v_snapshot_id uuid;
  v_snapshot_version integer;
  v_total_students integer;
  v_expected_summary_records bigint;
  v_inserted_records bigint;
BEGIN
  IF p_exam_session_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Exam session and actor are required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1 FROM public.users u WHERE u.id = p_actor_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publisher user not found' USING ERRCODE = '23503';
  END IF;

  SELECT es.* INTO v_session
  FROM public.exam_sessions es
  WHERE es.id = p_exam_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status = 'CLOSED' THEN
    RAISE EXCEPTION 'A closed exam session cannot be published'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_eligible_count
  FROM public.exam_registrations er
  WHERE er.exam_session_id = p_exam_session_id
    AND er.is_eligible = true;

  IF v_eligible_count = 0 THEN
    RAISE EXCEPTION 'No eligible exam registrations found for this exam session'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_result_count
  FROM public.processed_results pr
  INNER JOIN public.exam_registrations er
    ON er.id = pr.exam_registration_id
  WHERE er.exam_session_id = p_exam_session_id
    AND er.is_eligible = true
    AND pr.exam_session_id = p_exam_session_id;

  IF v_result_count <> v_eligible_count THEN
    RAISE EXCEPTION
      'Cannot publish incomplete results: % eligible registrations but % processed results',
      v_eligible_count, v_result_count
      USING ERRCODE = '23514';
  END IF;

  -- Each processed row must point to a result-bearing student/semester pair
  -- with exactly one corresponding semester summary.
  SELECT count(*) INTO v_missing_summary_count
  FROM (
    SELECT DISTINCT pr.student_id, pr.source_semester_id
    FROM public.processed_results pr
    INNER JOIN public.exam_registrations er
      ON er.id = pr.exam_registration_id
    WHERE er.exam_session_id = p_exam_session_id
      AND er.is_eligible = true
      AND pr.exam_session_id = p_exam_session_id
  ) required_pairs
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.semester_summaries ss
    WHERE ss.exam_session_id = p_exam_session_id
      AND ss.student_id = required_pairs.student_id
      AND ss.semester_id = required_pairs.source_semester_id
  );

  IF v_missing_summary_count > 0 THEN
    RAISE EXCEPTION 'Cannot publish results: % student-semester summaries are missing',
      v_missing_summary_count
      USING ERRCODE = '23514';
  END IF;

  SELECT count(DISTINCT pr.student_id)::integer INTO v_total_students
  FROM public.processed_results pr
  INNER JOIN public.exam_registrations er
    ON er.id = pr.exam_registration_id
  WHERE er.exam_session_id = p_exam_session_id
    AND er.is_eligible = true
    AND pr.exam_session_id = p_exam_session_id;

  SELECT COALESCE(max(ps.snapshot_version), 0) + 1
    INTO v_snapshot_version
  FROM public.publish_snapshots ps
  WHERE ps.exam_session_id = p_exam_session_id;

  INSERT INTO public.publish_snapshots (
    exam_session_id,
    snapshot_version,
    published_by,
    published_at,
    total_students,
    total_subjects,
    storage_version,
    frozen_results,
    frozen_summaries,
    status,
    notes
  )
  VALUES (
    p_exam_session_id,
    v_snapshot_version,
    p_actor_user_id,
    now(),
    v_total_students,
    v_result_count::integer,
    2,
    '[]'::jsonb,
    '[]'::jsonb,
    'ACTIVE',
    btrim(COALESCE(p_notes, ''))
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO public.published_result_snapshot_records (
    snapshot_id,
    exam_session_id,
    student_id,
    record_type,
    subject_id,
    payload
  )
  SELECT
    v_snapshot_id,
    p_exam_session_id,
    pr.student_id,
    'RESULT',
    pr.subject_id,
    jsonb_build_object(
      'processedResultId', pr.id,
      'student', jsonb_build_object(
        'id', st.id,
        'registerNumber', st.register_number,
        'fullName', st.full_name
      ),
      'examRegistrationId', pr.exam_registration_id,
      'subject', jsonb_build_object(
        'id', sb.id,
        'code', sb.code,
        'name', sb.name,
        'shortName', sb.short_name,
        'subjectType', sb.subject_type,
        'credits', sb.credits
      ),
      'sourceSemester', jsonb_build_object(
        'id', sm.id,
        'number', sm.number,
        'label', sm.label,
        'displayOrder', sm.display_order
      ),
      'attemptType', pr.attempt_type,
      'attemptNumber', pr.attempt_number,
      'internalMark', pr.internal_mark,
      'externalMark', pr.external_mark,
      'totalMark', pr.total_mark,
      'passStatus', pr.pass_status,
      'grade', pr.grade,
      'gradePoint', pr.grade_point,
      'creditsEarned', pr.credits_earned,
      'gradingPolicyId', pr.grading_policy_id,
      'resultVersion', pr.result_version,
      'processedAt', pr.processed_at
    )
  FROM public.processed_results pr
  INNER JOIN public.exam_registrations er
    ON er.id = pr.exam_registration_id
  INNER JOIN public.students st ON st.id = pr.student_id
  INNER JOIN public.subjects sb ON sb.id = pr.subject_id
  INNER JOIN public.semesters sm ON sm.id = pr.source_semester_id
  WHERE er.exam_session_id = p_exam_session_id
    AND er.is_eligible = true
    AND pr.exam_session_id = p_exam_session_id;

  GET DIAGNOSTICS v_inserted_records = ROW_COUNT;
  IF v_inserted_records <> v_result_count THEN
    RAISE EXCEPTION
      'Snapshot result record mismatch: expected %, inserted %',
      v_result_count, v_inserted_records
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_expected_summary_records
  FROM (
    SELECT DISTINCT pr.student_id, pr.source_semester_id
    FROM public.processed_results pr
    INNER JOIN public.exam_registrations er
      ON er.id = pr.exam_registration_id
    WHERE er.exam_session_id = p_exam_session_id
      AND er.is_eligible = true
      AND pr.exam_session_id = p_exam_session_id
  ) required_pairs;

  INSERT INTO public.published_result_snapshot_records (
    snapshot_id,
    exam_session_id,
    student_id,
    record_type,
    subject_id,
    payload
  )
  SELECT
    v_snapshot_id,
    p_exam_session_id,
    ss.student_id,
    'SUMMARY',
    NULL,
    jsonb_build_object(
      'studentId', ss.student_id,
      'studentRegisterNumber', st.register_number,
      'studentFullName', st.full_name,
      'semester', jsonb_build_object(
        'id', sm.id,
        'number', sm.number,
        'label', sm.label,
        'displayOrder', sm.display_order
      ),
      'totalRegisteredSubjects', ss.total_registered_subjects,
      'totalPassedSubjects', ss.total_passed_subjects,
      'totalFailedSubjects', ss.total_failed_subjects,
      'totalRegisteredCredits', ss.total_registered_credits,
      'totalEarnedCredits', ss.total_earned_credits,
      'gpa', ss.gpa,
      'cgpa', ss.cgpa,
      'currentArrearCount', ss.current_arrear_count,
      'totalPendingArrearCount', ss.total_pending_arrear_count,
      'totalClearedArrearCount', ss.total_cleared_arrear_count,
      'resultVersion', ss.result_version
    )
  FROM public.semester_summaries ss
  INNER JOIN public.students st ON st.id = ss.student_id
  INNER JOIN public.semesters sm ON sm.id = ss.semester_id
  WHERE ss.exam_session_id = p_exam_session_id
    AND EXISTS (
      SELECT 1
      FROM public.processed_results pr
      INNER JOIN public.exam_registrations er
        ON er.id = pr.exam_registration_id
      WHERE er.exam_session_id = p_exam_session_id
        AND er.is_eligible = true
        AND pr.exam_session_id = p_exam_session_id
        AND pr.student_id = ss.student_id
        AND pr.source_semester_id = ss.semester_id
    );

  GET DIAGNOSTICS v_inserted_records = ROW_COUNT;
  IF v_inserted_records <> v_expected_summary_records THEN
    RAISE EXCEPTION
      'Snapshot summary record mismatch: expected %, inserted %',
      v_expected_summary_records, v_inserted_records
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.publish_snapshots ps
  SET status = 'SUPERSEDED',
      updated_at = now()
  WHERE ps.exam_session_id = p_exam_session_id
    AND ps.id <> v_snapshot_id
    AND ps.status = 'ACTIVE';

  UPDATE public.processed_results pr
  SET is_published = true,
      updated_at = now()
  FROM public.exam_registrations er
  WHERE er.id = pr.exam_registration_id
    AND er.exam_session_id = p_exam_session_id
    AND er.is_eligible = true
    AND pr.exam_session_id = p_exam_session_id;

  UPDATE public.semester_summaries ss
  SET is_published = true,
      updated_at = now()
  WHERE ss.exam_session_id = p_exam_session_id
    AND EXISTS (
      SELECT 1
      FROM public.processed_results pr
      INNER JOIN public.exam_registrations er
        ON er.id = pr.exam_registration_id
      WHERE er.exam_session_id = p_exam_session_id
        AND er.is_eligible = true
        AND pr.exam_session_id = p_exam_session_id
        AND pr.student_id = ss.student_id
        AND pr.source_semester_id = ss.semester_id
    );

  UPDATE public.exam_sessions
  SET status = 'PUBLISHED',
      result_published_at = now(),
      result_published_by = p_actor_user_id,
      updated_at = now()
  WHERE id = p_exam_session_id;

  RETURN QUERY SELECT v_snapshot_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rollback_publish_snapshot(
  p_snapshot_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
RETURNS TABLE(snapshot_id uuid)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_exam_session_id uuid;
  v_session public.exam_sessions%ROWTYPE;
  v_snapshot public.publish_snapshots%ROWTYPE;
BEGIN
  IF p_snapshot_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Snapshot and actor are required'
      USING ERRCODE = '22004';
  END IF;

  PERFORM 1 FROM public.users u WHERE u.id = p_actor_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rollback actor user not found' USING ERRCODE = '23503';
  END IF;

  -- Read the owning session first, then lock session -> snapshot. This stable
  -- lock order avoids inversion with publish, which locks session first.
  SELECT ps.exam_session_id INTO v_exam_session_id
  FROM public.publish_snapshots ps
  WHERE ps.id = p_snapshot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publish snapshot not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT es.* INTO v_session
  FROM public.exam_sessions es
  WHERE es.id = v_exam_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exam session not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT ps.* INTO v_snapshot
  FROM public.publish_snapshots ps
  WHERE ps.id = p_snapshot_id
  FOR UPDATE;

  IF NOT FOUND OR v_snapshot.exam_session_id <> v_exam_session_id THEN
    RAISE EXCEPTION 'Publish snapshot not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_snapshot.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Only the active publication can be rolled back'
      USING ERRCODE = '23514';
  END IF;

  IF v_session.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'Exam session is not in the published state'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.processed_results
  SET is_published = false,
      updated_at = now()
  WHERE exam_session_id = v_exam_session_id
    AND is_published = true;

  UPDATE public.semester_summaries
  SET is_published = false,
      updated_at = now()
  WHERE exam_session_id = v_exam_session_id
    AND is_published = true;

  UPDATE public.publish_snapshots
  SET status = 'ROLLED_BACK',
      rolled_back_at = now(),
      rolled_back_by = p_actor_user_id,
      rollback_reason = btrim(COALESCE(p_reason, '')),
      updated_at = now()
  WHERE id = p_snapshot_id;

  UPDATE public.exam_sessions
  SET status = 'APPROVED',
      result_published_at = NULL,
      result_published_by = NULL,
      updated_at = now()
  WHERE id = v_exam_session_id;

  -- Intentionally do not reactivate an older SUPERSEDED snapshot.
  RETURN QUERY SELECT p_snapshot_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_exam_session_snapshot(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_publish_snapshot(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_exam_session_snapshot(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_publish_snapshot(uuid, uuid, text)
  TO service_role;

COMMIT;

-- Follow-up hardening is intentionally NOT included in this executable proposal:
--   1. Add immutable-record UPDATE/DELETE protection for published_result_snapshot_records.
--   2. Add a CHECK constraint for publish_snapshots.status in
--      ('ACTIVE','ROLLED_BACK','SUPERSEDED') after confirming no legacy values.
--   3. Add the Mongo parity index on (snapshot_id, student_id, record_type, subject_id)
--      and a status index on publish_snapshots after workload review.
--   4. Validate actual PostgreSQL role grants and run Supabase security advisors.
--   5. Add SQL integration tests against a disposable database before any production apply.
