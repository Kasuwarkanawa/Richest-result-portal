create index programs_department_id_idx on public.programs(department_id);
create index user_departments_department_id_idx on public.user_departments(department_id);
create index students_regulation_id_idx on public.students(regulation_id);
create index students_current_semester_id_idx on public.students(current_semester_id);
create index curriculum_mappings_program_id_idx on public.curriculum_mappings(program_id);
create index curriculum_mappings_regulation_id_idx on public.curriculum_mappings(regulation_id);
create index curriculum_mappings_semester_id_idx on public.curriculum_mappings(semester_id);
create index curriculum_mappings_subject_id_idx on public.curriculum_mappings(subject_id);
create index exam_sessions_parent_exam_session_id_idx on public.exam_sessions(parent_exam_session_id);
create index exam_sessions_result_published_by_idx on public.exam_sessions(result_published_by);
create index grading_policies_regulation_id_idx on public.grading_policies(regulation_id);
create index exam_registrations_subject_id_idx on public.exam_registrations(subject_id);
create index exam_registrations_source_semester_id_idx on public.exam_registrations(source_semester_id);
create index mark_entries_student_id_idx on public.mark_entries(student_id);
create index mark_entries_subject_id_idx on public.mark_entries(subject_id);
create index mark_entries_entered_by_idx on public.mark_entries(entered_by);
create index mark_entries_verified_by_idx on public.mark_entries(verified_by);
create index mark_entries_locked_by_idx on public.mark_entries(locked_by);
create index processed_results_exam_session_id_idx on public.processed_results(exam_session_id);
create index processed_results_subject_id_idx on public.processed_results(subject_id);
create index processed_results_source_semester_id_idx on public.processed_results(source_semester_id);
create index processed_results_grading_policy_id_idx on public.processed_results(grading_policy_id);
create index semester_summaries_exam_session_id_idx on public.semester_summaries(exam_session_id);
create index semester_summaries_semester_id_idx on public.semester_summaries(semester_id);
create index publish_snapshots_published_by_idx on public.publish_snapshots(published_by);
create index publish_snapshots_rolled_back_by_idx on public.publish_snapshots(rolled_back_by);
create index published_snapshot_records_snapshot_id_idx on public.published_result_snapshot_records(snapshot_id);
create index published_snapshot_records_exam_session_id_idx on public.published_result_snapshot_records(exam_session_id);
create index published_snapshot_records_subject_id_idx on public.published_result_snapshot_records(subject_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'departments','programs','regulations','batches','semesters','users',
    'students','subjects','exam_sessions','curriculum_mappings','grading_policies',
    'exam_registrations','mark_entries','processed_results','semester_summaries',
    'publish_snapshots','published_result_snapshot_records'
  ]
  loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end $$;
