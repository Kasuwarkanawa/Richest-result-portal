-- Disposable PostgreSQL 17 test schema only. Never points at Supabase.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE TABLE users (id uuid PRIMARY KEY);
CREATE TABLE students (id uuid PRIMARY KEY, register_number text NOT NULL, full_name text NOT NULL);
CREATE TABLE subjects (id uuid PRIMARY KEY, code text NOT NULL, name text NOT NULL, short_name text NOT NULL DEFAULT '', subject_type text NOT NULL, credits numeric NOT NULL);
CREATE TABLE semesters (id uuid PRIMARY KEY, number integer NOT NULL, label text NOT NULL, display_order integer NOT NULL);
CREATE TABLE exam_sessions (
 id uuid PRIMARY KEY, name text NOT NULL, exam_month text, exam_year integer NOT NULL,
 session_category text NOT NULL, parent_exam_session_id uuid, status text NOT NULL DEFAULT 'DRAFT',
 applicable_regulation_ids uuid[] NOT NULL DEFAULT '{}', applicable_batch_ids uuid[] NOT NULL DEFAULT '{}',
 result_published_at timestamptz, result_published_by uuid REFERENCES users(id),
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE exam_registrations (
 id uuid PRIMARY KEY, exam_session_id uuid NOT NULL REFERENCES exam_sessions(id),
 student_id uuid NOT NULL REFERENCES students(id), subject_id uuid NOT NULL REFERENCES subjects(id),
 source_semester_id uuid NOT NULL REFERENCES semesters(id), attempt_type text NOT NULL,
 attempt_number integer NOT NULL DEFAULT 1, registration_status text NOT NULL DEFAULT 'REGISTERED',
 is_eligible boolean NOT NULL DEFAULT true, remarks text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE processed_results (
 id uuid PRIMARY KEY, exam_session_id uuid NOT NULL REFERENCES exam_sessions(id),
 exam_registration_id uuid NOT NULL UNIQUE REFERENCES exam_registrations(id),
 student_id uuid NOT NULL REFERENCES students(id), subject_id uuid NOT NULL REFERENCES subjects(id),
 source_semester_id uuid NOT NULL REFERENCES semesters(id), attempt_type text NOT NULL,
 attempt_number integer NOT NULL, internal_mark numeric NOT NULL, external_mark numeric NOT NULL,
 total_mark numeric NOT NULL, pass_status text NOT NULL, grade text NOT NULL,
 grade_point numeric NOT NULL, credits_earned numeric NOT NULL, grading_policy_id uuid NOT NULL,
 result_version integer NOT NULL DEFAULT 1, is_published boolean NOT NULL DEFAULT false,
 processed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE semester_summaries (
 id uuid PRIMARY KEY, student_id uuid NOT NULL REFERENCES students(id),
 exam_session_id uuid NOT NULL REFERENCES exam_sessions(id), semester_id uuid NOT NULL REFERENCES semesters(id),
 total_registered_subjects integer NOT NULL, total_passed_subjects integer NOT NULL,
 total_failed_subjects integer NOT NULL, total_registered_credits numeric NOT NULL,
 total_earned_credits numeric NOT NULL, gpa numeric NOT NULL, cgpa numeric NOT NULL,
 current_arrear_count integer NOT NULL, total_pending_arrear_count integer NOT NULL,
 total_cleared_arrear_count integer NOT NULL, result_version integer NOT NULL DEFAULT 1,
 is_published boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(student_id,exam_session_id,semester_id)
);
CREATE TABLE publish_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), exam_session_id uuid NOT NULL REFERENCES exam_sessions(id),
 snapshot_version integer NOT NULL, published_by uuid NOT NULL REFERENCES users(id),
 published_at timestamptz NOT NULL DEFAULT now(), total_students integer NOT NULL,
 total_subjects integer NOT NULL, storage_version integer NOT NULL DEFAULT 1,
 frozen_results jsonb NOT NULL DEFAULT '[]', frozen_summaries jsonb NOT NULL DEFAULT '[]',
 rolled_back_at timestamptz, rolled_back_by uuid REFERENCES users(id), rollback_reason text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'ACTIVE', notes text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(exam_session_id,snapshot_version)
);
CREATE TABLE published_result_snapshot_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id uuid NOT NULL REFERENCES publish_snapshots(id),
 exam_session_id uuid NOT NULL REFERENCES exam_sessions(id), student_id uuid NOT NULL REFERENCES students(id),
 record_type text NOT NULL CHECK(record_type IN ('RESULT','SUMMARY')), subject_id uuid REFERENCES subjects(id),
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
