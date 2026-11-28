# Supabase publication RPC verification

Date: 2026-11-28

## Scope and safety

This is a read-only verification record for Supabase project `RIGCHEST-RESULT-PORTAL`
(`qqvbsykhkxwarsdjantc`) and the proposal in
`docs/sql-proposals/publication-snapshot-rpcs.proposal.sql`.

No DDL, RPC, policy, grant, data import, or deployment was applied during this
verification. The SQL proposal remains a proposal only. MongoDB remains the
production/rollback database. No production cutover is authorized by this
document.

## GitHub verification

Commit `9c31a6169c79e460668a7a5eba39274d5661e87d` was checked in GitHub Actions:

- PostgreSQL 17 publication RPC integration tests: SUCCESS
  - Disposable schema creation: SUCCESS
  - Proposal SQL installation in disposable PostgreSQL 17: SUCCESS
  - Publication and rollback integration tests: SUCCESS
- Portal quality checks: SUCCESS
  - Frontend build: SUCCESS
  - Backend tests: SUCCESS
- Backend syntax check: SUCCESS

These are CI results against the disposable PostgreSQL 17 fixture, not a live
production migration test.

## Read-only Supabase schema audit

The Supabase project reported status `ACTIVE_HEALTHY` and PostgreSQL 17.12.

- Public base tables: 18
- Tables with RLS enabled: 18
- Public-schema table columns referenced by the publication RPC proposal: no
  missing columns found.
- `anon` and `authenticated` table grants: 0
- `service_role` has table privileges on the reviewed application tables.
- Snapshot header rows: 0
- Frozen snapshot record rows: 0
- Publication RPC grants: none, because the proposal functions have not been
  installed.

The Security Advisor reports 18 `RLS Enabled No Policy` informational findings.
This is consistent with the current server-only access design: no browser role
has table grants, while the backend is intended to use the privileged
service-role credential. Do not add broad public policies to silence this
finding. Revisit policies only if the application access model changes.

## Schema constraints confirmed

- Each processed result has a unique `exam_registration_id`.
- Each exam registration is unique per session, student, and subject.
- Each semester summary is unique per student, exam session, and semester.
- Snapshot version is unique per exam session.
- Snapshot records restrict `record_type` to `RESULT` or `SUMMARY`.
- Snapshot record `subject_id` is nullable, as required for summary records.

## Remaining work before any production apply

1. Keep the verified MongoDB counting semantics: `total_students` is the
   distinct student count; `total_subjects` is the processed-result row count.
   The proposal matches this behavior.
2. Add and test immutable-record protections for published snapshot rows.
3. Confirm status-value compatibility and all route-level role checks against
   the original application behavior.
4. Complete repository-wide runtime wiring and data migration/ETL audit.
5. Compare source and target row counts and verify password/PIN hash preservation
   and legacy ObjectId-to-UUID mapping.
6. Complete security review and end-to-end tests.
7. Obtain explicit authorization before any production DDL, deployment,
   data import, cutover, or MongoDB retirement.

Never merge the migration PR or delete/alter the MongoDB production database as
part of these verification steps.
