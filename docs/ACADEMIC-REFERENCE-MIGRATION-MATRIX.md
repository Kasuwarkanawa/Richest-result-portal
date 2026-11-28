# RIGCHEST Reference Data and Academic Migration Matrix

Status: implementation planning only. This document records dependencies verified in the current MongoDB-backed application on `migration/supabase-postgres`. It does not create database objects, import data, change runtime routing, or authorize a production cutover.

## Verified API modules

The API router currently mounts these modules: authentication, dashboard, departments, programs, regulations, batches, semesters, subjects, grading policies, curriculum mappings, students, exam sessions, exam registrations, mark entries, results, publication, and public results.

## Verified reference-data relationships

| Entity | Verified fields / relationships | Migration dependency |
|---|---|---|
| Departments | code, name, shortName, status | Root reference entity |
| Programs | code, name, shortName, degreeType, durationInSemesters, departmentId | Departments |
| Regulations | code, name, effectiveFromBatchYear, effectiveToBatchYear, isActive | Root reference entity |
| Batches | label, startYear, endYear, isActive | Root reference entity |
| Semesters | number, label, displayOrder, isActive | Root reference entity |
| Subjects | code, name, shortName, subjectType, credits, internalMax, externalMax, totalMax, hasInternal, hasExternal, isActive | Root reference entity |
| Curriculum mappings | batchId, programId, regulationId, semesterId, subjectId, sequenceNo, isElective, isActive | Batches, programs, regulations, semesters, subjects |

The program model requires a department. Student records reference department, program, regulation, batch, and current semester. Curriculum mappings require all five academic reference entities shown above. Their existing Mongo ObjectId values must be resolved through the approved legacy-ID mapping process; they must never be cast or copied as PostgreSQL UUIDs.

## Verified downstream academic relationships

| Entity | Verified references | Migration dependency |
|---|---|---|
| Students | Department, program, regulation, batch, current semester | All relevant reference data |
| Exam sessions | Parent exam session, applicable regulations, applicable batches, publishing user | Regulations, batches, users; parent sessions require ordered loading |
| Exam registrations | Exam session, student, subject, source semester | Sessions, students, subjects, semesters |
| Mark entries | Exam registration, exam session, student, subject, entered/verified/locked users | Registrations, sessions, students, subjects, users |
| Processed results | Exam session, registration, student, subject, source semester, grading policy | All source entities and grading policies |

The current exam-session service validates referenced regulation, batch, and user records against MongoDB. The current curriculum service validates each referenced batch, program, regulation, semester, and subject against MongoDB. This confirms that moving only the reference tables without updating their consumers would leave the application dependent on MongoDB.

## Proposed migration order

1. Reference roots: departments, regulations, batches, semesters, and subjects.
2. Programs after departments.
3. Grading policies after inspecting their full model and service rules.
4. Curriculum mappings after batches, programs, regulations, semesters, and subjects.
5. Students after their five academic references.
6. Exam sessions after regulations, batches, and user identity mapping; load parent sessions before child revaluation sessions.
7. Exam registrations after sessions, students, subjects, and semesters.
8. Mark entries after registrations and the user actor mapping.
9. Processed results and semester summaries after their complete source dependencies.
10. Publication snapshots and immutable published snapshot records only after validating exact historical payload preservation.

This is a dependency order, not permission to run a bulk import. A real import still needs source counts, duplicate/orphan checks, deterministic UUID mapping, reconciliation reports, and an approved rollback plan.

## Safety gates before runtime cutover

- Keep MongoDB as the production source of truth and rollback target.
- Preserve bcrypt password hashes and student PIN hashes; do not change the authentication scheme as part of reference-data migration.
- Keep Supabase RLS enabled. Do not add broad client policies; privileged service-role access must remain server-only.
- Do not rewrite actor IDs in JWTs until all services that validate or persist user actors have migrated together.
- Preserve published result snapshots byte-for-byte / semantically exactly, including historical grades, totals, and publication metadata.
- Compare source and target counts by entity and verify every foreign-key mapping before enabling any Supabase-backed reads or writes.
- No Supabase DDL, ledger-table creation, data import, production deployment, PR merge, or MongoDB deletion is authorized by this planning document.

## Next implementation slice

The safest next slice is a read-only repository contract and tests for one reference entity, then a service-level adapter behind an explicit feature boundary. Start with departments and programs because their dependency is small and clear. Do not wire the adapter into production routes until the reference-data and user-identity contracts are complete.
