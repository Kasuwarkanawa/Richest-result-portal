# Publication Snapshot Migration Design

Status: design only — no database migration or runtime integration has been applied.

Target: Supabase project RIGCHEST-RESULT-PORTAL, branch: migration/supabase-postgres.

## 1. Existing PostgreSQL contract (inspected read-only)

### publish_snapshots
- id UUID primary key; exam_session_id UUID FK to exam_sessions.
- snapshot_version integer; published_by UUID FK to users; published_at timestamptz.
- total_students and total_subjects integers; storage_version integer default 1.
- frozen_results and frozen_summaries JSONB arrays.
- Rollback metadata: rolled_back_at, rolled_back_by, rollback_reason.
- status, notes, created_at, updated_at.
- Unique constraint: (exam_session_id, snapshot_version).

### published_result_snapshot_records
- id UUID primary key; snapshot_id UUID FK to publish_snapshots.
- exam_session_id and student_id UUID foreign keys.
- record_type constrained to RESULT or SUMMARY.
- subject_id nullable UUID FK to subjects; payload JSONB; timestamps.
- Existing indexes cover snapshot, session, student/type/created time, and subject.
- No unique constraint on logical record identity and no database immutability trigger were found in the inspected schema.

### Related tables
- processed_results has a unique exam_registration_id.
- semester_summaries has a unique (student_id, exam_session_id, semester_id).
- Both have is_published and result_version.
- All listed tables have RLS enabled. No public/anon/authenticated policies were found; backend access must remain server-only.

## 2. Required publication invariants
1. Publication is one atomic operation. Never leave a snapshot header without all records, or mark results published without a complete snapshot.
2. Serialize concurrent publishers for the same exam session.
3. Allocate snapshot versions under that lock and retain unique (exam_session_id, snapshot_version).
4. Freeze exact result and summary payloads, including storage schema version. Preserve original Mongo JSON shape; inspect source service before implementation.
5. Snapshot record payloads and frozen JSON arrays are immutable after publication. Rollback metadata may change; frozen content may not.
6. All actor IDs must be PostgreSQL UUIDs resolved through the approved legacy-ID mapping. Never cast Mongo ObjectIds.
7. Snapshot header, snapshot records, processed_results.is_published, semester_summaries.is_published, and exam-session publication fields must change in one transaction.
8. Public result reads must use the active published snapshot contract, not draft rows.

## 3. Transaction boundary
The current server-side PostgREST helper performs individual HTTP requests and does not provide a multi-request transaction. Ordinary REST inserts/updates are therefore unsafe for publication.

Recommended approach: a narrowly scoped PostgreSQL RPC called by the backend with the server-only service-role key. Within one transaction it should:
- lock the target exam_sessions row FOR UPDATE to serialize publication attempts;
- validate publishable session state and completeness of processed results and summaries;
- allocate the next snapshot version while holding the lock;
- build frozen JSON from the exact rows being published;
- insert the snapshot header and all immutable record rows;
- mark corresponding results and summaries as published;
- update exam-session publication status, timestamp, and actor;
- return the committed snapshot header and counts.

The function must raise on any validation or write failure so PostgreSQL rolls back the transaction. Exact status transitions and completeness rules must come from the original Mongo publication service, not assumptions.

## 4. Rollback design requirements
Rollback must be a second atomic operation. Retain the snapshot and historical payloads, record actor/timestamp/reason, and restore current result/session state only according to the existing Mongo rollback service.

Do not infer whether rollback reopens a session, restores an earlier snapshot, clears publication flags, or changes the active snapshot until the original rollback implementation and status constants are inspected.

## 5. Schema hardening to review before enabling publication
The inspected schema has no immutable-row trigger for published_result_snapshot_records and no logical uniqueness constraint on its record identity. Explicitly review:
- database-level guard against UPDATE/DELETE of immutable snapshot payload rows;
- whether uniqueness is required for (snapshot_id, student_id, record_type, subject_id), with careful handling of nullable subject_id;
- allowed snapshot status values and legal rollback transitions;
- non-negative count checks and positive snapshot/storage versions;
- RPC execution privileges, with no client-facing direct write grants.

These are proposals only. No DDL, policy, trigger, index, or RPC has been created by this document.

## 6. Implementation gates
Before coding the repository or RPC:
1. Inspect exact Mongo snapshot models, publication service, rollback service, status constants, controllers, and route authorization.
2. Capture representative published snapshots and compare JSON shape field-for-field without exposing student secrets.
3. Confirm rules for empty sessions, partial results, withheld/malpractice entries, revaluation sessions, and republishing after rollback.
4. Confirm total-student and total-subject counting semantics.
5. Test atomic publication/rollback, injected failures, concurrent publishers, repeated publish/rollback, and immutable-history assertions.
6. Only then propose an explicit database migration for review. Keep MongoDB production and custom JWT/auth unchanged until cutover gates are met.

## 7. Current safety boundary
This document changes no runtime route, service, auth provider, production database, MongoDB data, or Supabase schema. The migration branch remains separate from main; PR #3 remains unmerged.

## 8. Confirmed MongoDB publication behavior (source inspected on main)

The original service is backend/src/modules/publish/publish.service.js. These are source rules, not proposed changes:

### Publish

- Validate the actor user before starting the transaction.
- Reject a missing exam session and reject sessions in CLOSED state. Other session states are not rejected by this service.
- Select eligible exam registrations only (isEligible=true); reject an empty eligible set.
- Load processed results for the session and eligible registrations. Every result must resolve student, subject, and source semester.
- Require exactly one processed result per eligible registration. A missing registration result or a result-count mismatch blocks publication.
- Load summaries for the exam session. Require one matching summary for every distinct student/source-semester pair represented by the processed results. Only those required summaries are frozen.
- RESULT payload shape: processedResultId; nested student {id, registerNumber, fullName}; examRegistrationId; nested subject {id, code, name, shortName, subjectType, credits}; nested sourceSemester {id, number, label, displayOrder}; attemptType; attemptNumber; internalMark; externalMark; totalMark; passStatus; grade; gradePoint; creditsEarned; gradingPolicyId; resultVersion; processedAt.
- SUMMARY payload shape: studentId; studentRegisterNumber; studentFullName; nested semester {id, number, label, displayOrder}; totalRegisteredSubjects; totalPassedSubjects; totalFailedSubjects; totalRegisteredCredits; totalEarnedCredits; gpa; cgpa; currentArrearCount; totalPendingArrearCount; totalClearedArrearCount; resultVersion.
- snapshotVersion is max existing version for the session plus one, or 1.
- totalStudents is the distinct student count. totalSubjects is the processed-result row count (not a distinct subject count).
- New snapshot has storageVersion 2, ACTIVE status, notes trimmed, and publishedBy/publishedAt.
- Insert one RESULT record per frozen result (subjectId from payload) and one SUMMARY record per frozen summary (subjectId null).
- Supersede any previous ACTIVE snapshots for that session.
- Mark eligible processed results and the required summaries as published; set exam session status PUBLISHED and set publication timestamp/actor.
- All writes above occur inside one MongoDB transaction.

### Rollback

- Validate the actor user.
- Only an ACTIVE snapshot may be rolled back.
- Its exam session must exist and currently be PUBLISHED.
- Clear isPublished on all processed results and semester summaries for the exam session.
- Set the selected snapshot status to ROLLED_BACK, and set rolledBackAt, rolledBackBy, and trimmed rollbackReason.
- Set exam session status to APPROVED and clear resultPublishedAt/resultPublishedBy.
- Snapshot record rows and frozen payloads are retained. The source service does not reactivate an older SUPERSEDED snapshot.
- All rollback writes occur inside one MongoDB transaction.

### Read behavior

- Snapshot list and detail service responses exclude frozenResults and frozenSummaries from the snapshot header.
- They populate exam session (name, examMonth, examYear, sessionCategory, status) and publisher (fullName, email, role).
- Route authorization: publish and rollback require SUPER_ADMIN or EXAM_CELL_ADMIN. Snapshot list/detail also allow DEPARTMENT_ADMIN and VERIFIER.

Implementation must preserve these behaviors unless a separately approved product change says otherwise.
