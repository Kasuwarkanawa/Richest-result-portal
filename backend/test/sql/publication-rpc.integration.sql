\set ON_ERROR_STOP on
-- Build a representative academic session.
INSERT INTO users(id) VALUES ('10000000-0000-0000-0000-000000000001');
INSERT INTO students(id,register_number,full_name) VALUES ('20000000-0000-0000-0000-000000000001','RIG/001','Test Student');
INSERT INTO subjects(id,code,name,short_name,subject_type,credits) VALUES ('30000000-0000-0000-0000-000000000001','CHEW101','Anatomy','ANA','CORE',3);
INSERT INTO semesters(id,number,label,display_order) VALUES ('40000000-0000-0000-0000-000000000001',1,'Semester 1',1);
INSERT INTO exam_sessions(id,name,exam_year,session_category,status) VALUES
 ('50000000-0000-0000-0000-000000000001','Test Examination',2026,'REGULAR','APPROVED');
INSERT INTO exam_registrations(id,exam_session_id,student_id,subject_id,source_semester_id,attempt_type)
VALUES ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','REGULAR');
INSERT INTO processed_results(id,exam_session_id,exam_registration_id,student_id,subject_id,source_semester_id,attempt_type,attempt_number,internal_mark,external_mark,total_mark,pass_status,grade,grade_point,credits_earned,grading_policy_id)
VALUES ('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','REGULAR',1,25,60,85,'PASS','A',4,3,'80000000-0000-0000-0000-000000000001');
INSERT INTO semester_summaries(id,student_id,exam_session_id,semester_id,total_registered_subjects,total_passed_subjects,total_failed_subjects,total_registered_credits,total_earned_credits,gpa,cgpa,current_arrear_count,total_pending_arrear_count,total_cleared_arrear_count)
VALUES ('90000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',1,1,0,3,3,4,4,0,0,0);

-- Concurrent calls must serialize and allocate versions 1 and 2.
\! (psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select * from public.publish_exam_session_snapshot('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','parallel A')" >/tmp/publish-a.log 2>&1 & psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select * from public.publish_exam_session_snapshot('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','parallel B')" >/tmp/publish-b.log 2>&1 & wait)
DO $$ BEGIN
 IF (SELECT count(*) FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000001') <> 2 THEN RAISE EXCEPTION 'concurrent publish did not create two versions'; END IF;
 IF (SELECT count(*) FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000001' AND status='ACTIVE') <> 1 THEN RAISE EXCEPTION 'expected exactly one active snapshot'; END IF;
 IF (SELECT count(*) FROM published_result_snapshot_records r JOIN publish_snapshots p ON p.id=r.snapshot_id WHERE p.exam_session_id='50000000-0000-0000-0000-000000000001' AND p.status='ACTIVE') <> 2 THEN RAISE EXCEPTION 'active snapshot must contain RESULT and SUMMARY'; END IF;
 IF NOT (SELECT is_published FROM processed_results WHERE id='70000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'result publication flag not set'; END IF;
END $$;
SELECT public.rollback_publish_snapshot(
 (SELECT id FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000001' AND status='ACTIVE'),
 '10000000-0000-0000-0000-000000000001','integration test rollback'
);
DO $$ BEGIN
 IF (SELECT status FROM exam_sessions WHERE id='50000000-0000-0000-0000-000000000001') <> 'APPROVED' THEN RAISE EXCEPTION 'rollback did not restore APPROVED status'; END IF;
 IF (SELECT count(*) FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000001' AND status='SUPERSEDED') <> 1 THEN RAISE EXCEPTION 'rollback must retain superseded history'; END IF;
 IF (SELECT count(*) FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000001' AND status='ROLLED_BACK') <> 1 THEN RAISE EXCEPTION 'rollback snapshot state missing'; END IF;
 IF (SELECT is_published FROM processed_results WHERE id='70000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'rollback did not clear result publication flag'; END IF;
END $$;

-- A second eligible registration with no processed result must be rejected.
INSERT INTO exam_sessions(id,name,exam_year,session_category,status) VALUES ('50000000-0000-0000-0000-000000000002','Incomplete Session',2026,'REGULAR','APPROVED');
INSERT INTO exam_registrations(id,exam_session_id,student_id,subject_id,source_semester_id,attempt_type)
VALUES ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','REGULAR');
\! if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select * from public.publish_exam_session_snapshot('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','must fail')" >/tmp/expected-failure.log 2>&1; then echo 'Expected incomplete publication to fail' >&2; exit 1; fi
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'failed publish left a snapshot behind'; END IF;
 IF (SELECT status FROM exam_sessions WHERE id='50000000-0000-0000-0000-000000000002') <> 'APPROVED' THEN RAISE EXCEPTION 'failed publish changed session status'; END IF;
END $$;

-- A complete processed result without its student-semester summary must fail.
INSERT INTO exam_sessions(id,name,exam_year,session_category,status) VALUES ('50000000-0000-0000-0000-000000000003','Missing Summary Session',2026,'REGULAR','APPROVED');
INSERT INTO exam_registrations(id,exam_session_id,student_id,subject_id,source_semester_id,attempt_type)
VALUES ('60000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','REGULAR');
INSERT INTO processed_results(id,exam_session_id,exam_registration_id,student_id,subject_id,source_semester_id,attempt_type,attempt_number,internal_mark,external_mark,total_mark,pass_status,grade,grade_point,credits_earned,grading_policy_id)
VALUES ('70000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','REGULAR',1,25,60,85,'PASS','A',4,3,'80000000-0000-0000-0000-000000000001');
\! if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "select * from public.publish_exam_session_snapshot('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','missing summary must fail')" >/tmp/missing-summary.log 2>&1; then echo 'Expected missing-summary publication to fail' >&2; exit 1; fi
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM publish_snapshots WHERE exam_session_id='50000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'missing-summary publish left a snapshot behind'; END IF;
 IF (SELECT status FROM exam_sessions WHERE id='50000000-0000-0000-0000-000000000003') <> 'APPROVED' THEN RAISE EXCEPTION 'missing-summary publish changed session status'; END IF;
END $$;
