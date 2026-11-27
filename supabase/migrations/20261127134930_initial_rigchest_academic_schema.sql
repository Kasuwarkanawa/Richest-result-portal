create extension if not exists pgcrypto;

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  short_name text not null default '',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  short_name text not null,
  degree_type text not null,
  duration_in_semesters integer not null default 8 check (duration_in_semesters > 0),
  department_id uuid not null references public.departments(id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.regulations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  effective_from_batch_year integer not null,
  effective_to_batch_year integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  start_year integer not null,
  end_year integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(start_year, end_year),
  check (end_year >= start_year)
);

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number between 1 and 20),
  label text not null,
  display_order integer not null unique check (display_order between 1 and 20),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  mobile_no text not null default '',
  password_hash text not null,
  role text not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_departments (
  user_id uuid not null references public.users(id) on delete cascade,
  department_id uuid not null references public.departments(id),
  primary key(user_id, department_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  register_number text not null unique,
  university_register_no text not null default '',
  full_name text not null,
  dob date not null,
  student_pin_hash text,
  student_pin_generated_at timestamptz,
  gender text not null default '',
  mobile_no text not null default '',
  email text not null default '',
  department_id uuid not null references public.departments(id),
  program_id uuid not null references public.programs(id),
  regulation_id uuid not null references public.regulations(id),
  batch_id uuid not null references public.batches(id),
  current_semester_id uuid not null references public.semesters(id),
  academic_status text not null default 'ACTIVE',
  admission_year integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  short_name text not null default '',
  subject_type text not null,
  credits numeric(6,2) not null check (credits between 0 and 20),
  internal_max numeric(6,2) not null check (internal_max between 0 and 100),
  external_max numeric(6,2) not null check (external_max between 0 and 100),
  total_max numeric(6,2) not null check (total_max between 0 and 200),
  has_internal boolean not null default true,
  has_external boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  exam_month text,
  exam_year integer not null,
  session_category text not null,
  parent_exam_session_id uuid references public.exam_sessions(id),
  status text not null default 'DRAFT',
  applicable_regulation_ids uuid[] not null default '{}',
  applicable_batch_ids uuid[] not null default '{}',
  result_published_at timestamptz,
  result_published_by uuid references public.users(id),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.curriculum_mappings (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id),
  program_id uuid not null references public.programs(id),
  regulation_id uuid not null references public.regulations(id),
  semester_id uuid not null references public.semesters(id),
  subject_id uuid not null references public.subjects(id),
  sequence_no integer not null default 0,
  is_elective boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, program_id, regulation_id, semester_id, subject_id)
);

create table public.grading_policies (
  id uuid primary key default gen_random_uuid(),
  regulation_id uuid not null references public.regulations(id),
  subject_type text not null,
  internal_max numeric(6,2) not null,
  external_max numeric(6,2) not null,
  total_max numeric(6,2) not null,
  internal_min numeric(6,2) not null,
  external_min numeric(6,2) not null,
  total_min numeric(6,2) not null,
  grade_rules jsonb not null,
  gpa_formula_type text not null default 'CBCS',
  cgpa_formula_type text not null default 'CBCS',
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exam_registrations (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id),
  student_id uuid not null references public.students(id),
  subject_id uuid not null references public.subjects(id),
  source_semester_id uuid not null references public.semesters(id),
  attempt_type text not null,
  attempt_number integer not null default 1 check (attempt_number >= 1),
  registration_status text not null default 'REGISTERED',
  is_eligible boolean not null default true,
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_session_id, student_id, subject_id)
);

create table public.mark_entries (
  id uuid primary key default gen_random_uuid(),
  exam_registration_id uuid not null unique references public.exam_registrations(id),
  exam_session_id uuid not null references public.exam_sessions(id),
  student_id uuid not null references public.students(id),
  subject_id uuid not null references public.subjects(id),
  internal_mark numeric(7,2) not null default 0 check (internal_mark >= 0),
  external_mark numeric(7,2) not null default 0 check (external_mark >= 0),
  total_mark numeric(7,2) not null default 0 check (total_mark >= 0),
  is_absent boolean not null default false,
  is_withheld boolean not null default false,
  is_malpractice boolean not null default false,
  entry_status text not null default 'DRAFT',
  entered_by uuid references public.users(id),
  verified_by uuid references public.users(id),
  locked_by uuid references public.users(id),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processed_results (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id),
  exam_registration_id uuid not null unique references public.exam_registrations(id),
  student_id uuid not null references public.students(id),
  subject_id uuid not null references public.subjects(id),
  source_semester_id uuid not null references public.semesters(id),
  attempt_type text not null,
  attempt_number integer not null,
  internal_mark numeric(7,2) not null,
  external_mark numeric(7,2) not null,
  total_mark numeric(7,2) not null,
  pass_status text not null,
  grade text not null,
  grade_point numeric(5,2) not null,
  credits_earned numeric(7,2) not null,
  grading_policy_id uuid not null references public.grading_policies(id),
  result_version integer not null default 1,
  is_published boolean not null default false,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.semester_summaries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id),
  exam_session_id uuid not null references public.exam_sessions(id),
  semester_id uuid not null references public.semesters(id),
  total_registered_subjects integer not null,
  total_passed_subjects integer not null,
  total_failed_subjects integer not null,
  total_registered_credits numeric(8,2) not null,
  total_earned_credits numeric(8,2) not null,
  gpa numeric(6,3) not null,
  cgpa numeric(6,3) not null,
  current_arrear_count integer not null,
  total_pending_arrear_count integer not null,
  total_cleared_arrear_count integer not null,
  result_version integer not null default 1,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, exam_session_id, semester_id)
);

create table public.publish_snapshots (
  id uuid primary key default gen_random_uuid(),
  exam_session_id uuid not null references public.exam_sessions(id),
  snapshot_version integer not null,
  published_by uuid not null references public.users(id),
  published_at timestamptz not null default now(),
  total_students integer not null,
  total_subjects integer not null,
  storage_version integer not null default 1,
  frozen_results jsonb not null default '[]'::jsonb,
  frozen_summaries jsonb not null default '[]'::jsonb,
  rolled_back_at timestamptz,
  rolled_back_by uuid references public.users(id),
  rollback_reason text not null default '',
  status text not null default 'ACTIVE',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_session_id, snapshot_version)
);

create table public.published_result_snapshot_records (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.publish_snapshots(id),
  exam_session_id uuid not null references public.exam_sessions(id),
  student_id uuid not null references public.students(id),
  record_type text not null check (record_type in ('RESULT','SUMMARY')),
  subject_id uuid references public.subjects(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subjects_code_idx on public.subjects(code);
create index users_role_idx on public.users(role);
create index students_department_idx on public.students(department_id);
create index students_program_idx on public.students(program_id);
create index students_batch_idx on public.students(batch_id);
create index students_status_idx on public.students(academic_status);
create index exam_sessions_year_idx on public.exam_sessions(exam_year);
create index exam_registrations_student_idx on public.exam_registrations(student_id, subject_id, attempt_number);
create index mark_entries_session_student_idx on public.mark_entries(exam_session_id, student_id);
create index processed_results_student_session_idx on public.processed_results(student_id, exam_session_id);
create index semester_summaries_student_semester_idx on public.semester_summaries(student_id, semester_id);

alter table public.departments enable row level security;
alter table public.programs enable row level security;
alter table public.regulations enable row level security;
alter table public.batches enable row level security;
alter table public.semesters enable row level security;
alter table public.users enable row level security;
alter table public.user_departments enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.curriculum_mappings enable row level security;
alter table public.grading_policies enable row level security;
alter table public.exam_registrations enable row level security;
alter table public.mark_entries enable row level security;
alter table public.processed_results enable row level security;
alter table public.semester_summaries enable row level security;
alter table public.publish_snapshots enable row level security;
alter table public.published_result_snapshot_records enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant all on all tables in schema public to service_role;
