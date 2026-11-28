# RIGCHEST Supabase runtime cutover gap audit

Date: 2026-11-28
Repository: `Kasuwarkanawa/Richest-result-portal`
Branch: `migration/supabase-postgres`

## Scope and safety

This is a branch-only code inspection. No production code, database, environment
secret, deployment, or MongoDB setting was changed by this audit. MongoDB remains
the active production and rollback data store. This document does not authorize
DDL, data import, deployment, merge, or cutover.

## Verified runtime findings

The Supabase repository adapters are currently isolated adapters, not a complete
replacement for the existing application services.

### Authentication

`backend/src/modules/auth/auth.service.js` still imports the Mongoose
`User` model. Login reads the user through `User.findOne`, checks the existing
bcrypt password hash, updates `lastLoginAt`, and issues the existing access and
refresh JWTs. This behavior must be preserved when the user repository is
switched to PostgreSQL UUID identifiers.

Required parity:
- Case-normalized email lookup and inactive-account rejection.
- Existing bcrypt hashes remain valid; no forced password reset.
- JWT claim names, signing secrets, expiry settings, and refresh behavior stay
  compatible with existing clients.
- Department memberships and role claims must be loaded from normalized
  `user_departments` data without changing authorization semantics.

### Exam-session and academic workflows

`backend/src/modules/exam-sessions/examSession.service.js` still uses Mongoose
models for exam sessions, regulations, batches, and users. Its validation covers
regular/revaluation parent rules, applicable regulation and batch references,
status changes, and populated response shapes.

`backend/src/modules/results/result.service.js` still uses Mongoose models for
mark entries, exam registrations, subjects, students, exam sessions, grading
policies, processed results, and semester summaries. It owns grade decisions,
latest-attempt selection, GPA/CGPA calculation, arrear counts, and result
version increments. A database adapter switch must not replace or subtly alter
these business rules.

### Publication and public student results

`backend/src/modules/publish/publish.service.js` still uses Mongoose models and
MongoDB transactions. It freezes result and summary payloads, increments
snapshot versions, supersedes prior active snapshots, sets publication flags,
and updates the exam-session status. The PostgreSQL RPC proposal and isolated
repository adapter exist, but the live route/service is not yet wired to them.

`backend/src/modules/public-results/publicResult.service.js` still reads
students, PIN hashes, publication headers, and frozen snapshot records through
Mongoose. It verifies student PINs, builds the transcript from active snapshots,
selects latest attempts, returns history, and builds arrear summaries. This
student-facing read path must be ported and tested before cutover.

### Adapter inventory

Supabase repository files currently exist for users, legacy ID mappings,
departments, programs, regulations, batches, semesters, subjects, curriculum
mappings, grading policies, students, exam sessions, exam registrations,
mark entries, results, and publication snapshots. Unit tests cover adapter
contracts. Their existence alone does not prove the controllers/services are
using them.

## Cutover blockers

1. Implement and wire PostgreSQL-backed service paths for authentication,
   authorization, academic reference data, students, registration, marks,
   grading, result processing, summaries, publication, public result lookup,
   history, and PDF generation.
2. Preserve Mongo ObjectId-to-PostgreSQL UUID mappings consistently across
   every foreign key, JWT subject/user identifier, API response, and frozen
   snapshot payload.
3. Preserve bcrypt password hashes and student PIN hashes. Never expose hashes
   in API responses, logs, or client bundles.
4. Port Mongo transaction boundaries to PostgreSQL transactions/RPCs where
   atomicity is required. Do not simulate a multi-table transaction with
   independent PostgREST requests.
5. Compare source and target records, constraints, unique indexes, and
   authorization behavior. Verify row counts and referential integrity after
   a separately approved data migration.
6. Run regression and end-to-end tests for login, role access, department
   scoping, student PIN validation, import/export, marks locking, grade
   calculations, GPA/CGPA, arrears, publication, rollback, public result
   history, and PDF output.
7. Verify the deployed Preview uses only the intended Supabase project and
   server-side credentials; never expose the service-role key to frontend code.
8. Obtain explicit approval before any production schema change, data import,
   deployment, merge, cutover, or MongoDB retirement.

## Current conclusion

The migration foundation, isolated repositories, schema audit, and publication
RPC proposals are in place. The runtime is still MongoDB-backed for the critical
workflows above. This project is not ready for production cutover.
