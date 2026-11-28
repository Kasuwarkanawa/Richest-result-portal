# RIGCHEST MongoDB to Supabase migration

## Scope and safety
- Target repository: `Kasuwarkanawa/Richest-result-portal`.
- Work branch: `migration/supabase-postgres`.
- Target database: Supabase project `RIGCHEST-RESULT-PORTAL` (ref `qqvbsykhkxwarsdjantc`).
- Do not change the Kasuwar Kanawa repository, Supabase project, Vercel projects, or production MongoDB configuration during this migration.
- MongoDB remains the production/rollback database until parity tests and a controlled cutover are complete.

## Current target database inspection
The target Supabase project currently contains 18 public tables and the inspected application tables currently contain zero rows. Row-level security is enabled on all 18 tables. No policies were found. No direct grants to `anon` or `authenticated` were found. The 17 update triggers use `set_updated_at()`.

The backend must use a server-only privileged database connection. Never put a service-role secret or database password in frontend environment variables or source control. Keep public Data API access closed until an explicit least-privilege RLS design is implemented. If the API uses a server-side service-role client, keep that secret only in the backend deployment environment.

## Existing relational schema
The following tables were verified in `public`:
- Identity and access: `users`, `user_departments`.
- Student structure: `students`, `departments`, `programs`, `regulations`, `batches`, `semesters`, `subjects`, `curriculum_mappings`.
- Exams and marks: `exam_sessions`, `exam_registrations`, `mark_entries`.
- Results and publication: `grading_policies`, `processed_results`, `semester_summaries`, `publish_snapshots`, `published_result_snapshot_records`.

### Important model mappings
- Mongo `User.departmentIds[]` maps to the `user_departments` join table; do not store an array on `users`.
- Mongo ObjectIds map to PostgreSQL UUIDs. Every reference must be converted consistently during data migration; do not assume Mongo ObjectIds are valid UUIDs.
- `Student.studentPinHash` must remain private and must never be returned by student-facing queries.
- User password hashes remain bcrypt hashes; preserve the existing custom JWT access/refresh token contract during the first migration phase.
- `exam_sessions.applicable_regulation_ids` and `applicable_batch_ids` are UUID arrays in the current schema.
- `grading_policies.grade_rules`, `publish_snapshots.frozen_results`, `publish_snapshots.frozen_summaries`, and snapshot-record `payload` are JSONB and must preserve their existing shape.
- Published snapshot records are immutable historical output. Result processing and publication must not silently rewrite prior published snapshots.
- Preserve unique constraints for email, register number, exam registration identity, mark-entry registration identity, processed-result registration identity, and semester summary identity.

## Backend migration sequence
1. Introduce a server-only Supabase/PostgreSQL adapter and validate required environment variables without removing MongoDB support.
2. Complete a read-only dependency inventory for every Mongoose model/service and every route that consumes `req.user`. Keep MongoDB as the active identity provider during this stage.
3. Design and test a deterministic, auditable Mongo ObjectId-to-PostgreSQL UUID mapping for users and every referenced entity. The current schema has no dedicated legacy-ID mapping ledger; do not begin bulk identity import until this gap is explicitly designed and reviewed. Never cast or reinterpret a Mongo ObjectId as a UUID.
4. Port reference data modules (departments, programs, regulations, batches, semesters, subjects, curriculum mappings) and establish verified ID mappings before dependent records are imported.
5. Port user/department persistence and bcrypt-compatible password verification behind an isolated repository. Preserve roles, JWT claims, response shapes, department scoping, and inactive-user behavior. **Do not switch login or issue UUID-based user tokens yet** while any active Mongoose service still expects Mongo ObjectIds.
6. Port all actor-dependent consumers and audit writes to resolve the same canonical user identity. Verified PostgreSQL user foreign keys include `exam_sessions.result_published_by`, `mark_entries.entered_by/verified_by/locked_by`, `publish_snapshots.published_by/rolled_back_by`, and `user_departments.user_id`. The current Mongo mark-entry and publication services validate actors with `User.findById`; these checks and all writes must be migrated together with their related modules.
7. Port student CRUD, Excel import, student PIN generation/verification, exam sessions, registrations, marks, result processing, grading, GPA/CGPA, arrears, summaries, publication snapshots, rollback, public result lookup, and PDF output. Preserve snapshot history and all audit actor references.
8. Add migration-ledger reconciliation, row-count and relationship audits, auth compatibility tests, role/department authorization tests, and end-to-end parity tests against representative MongoDB and PostgreSQL fixtures.
9. Configure a separate Preview API deployment using Supabase credentials. Test login, refresh, `/me`, department-scoped operations, mark entry/verification/locking, publication, rollback, public result lookup, and printing before any production change.
10. Keep MongoDB available as production/rollback until the user explicitly approves cutover and the rollback window has passed.

## Security and release gates
- Do not expose the service-role key or database password in Vite/frontend variables.
- Do not enable broad `anon` or `authenticated` policies as a shortcut.
- Validate role and department authorization on the backend for every protected route.
- Ensure public result lookup returns only published snapshot payloads after register number + PIN verification.
- Do not deploy or change production environment variables until authentication, student import, marks, result calculations, publication, rollback, and printing tests pass.
- Do not remove the MongoDB dependency or production MongoDB secret until all Mongoose imports and production code paths have been migrated and verified.
