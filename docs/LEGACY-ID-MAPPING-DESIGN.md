# RIGCHEST legacy ID mapping design

## Status
Design only. This document does not create database objects, import records, change application runtime behavior, or change deployment settings. MongoDB remains the production and rollback source.

## Why a mapping ledger is required
MongoDB documents use 24-character ObjectIds while the Supabase schema uses PostgreSQL UUID primary keys. These values are different identifier types and must never be cast, truncated, or treated as interchangeable.

A consistent mapping is required for every migrated entity and every reference to it. This includes user department memberships, student academic references, exam registrations, marks, result records, publication snapshots, and actor/audit references. The target schema currently has no dedicated legacy-ID mapping ledger.

## Proposed mapping record
Before importing application data, review and approve a migration ledger with at least:

- `source_system`: fixed identifier for the source, e.g. `mongodb-rigchest`.
- `entity_type`: stable logical collection/entity name, e.g. `users`, `departments`, `students`.
- `legacy_id`: exact lower-case 24-character Mongo ObjectId string, stored as text.
- `target_id`: assigned PostgreSQL UUID.
- `migration_batch_id`: identifier for the import run.
- `source_updated_at`: source document update timestamp when available.
- `source_checksum`: canonical source-record checksum for reconciliation.
- `mapping_status`: pending, imported, verified, or failed.
- `created_at` and `verified_at`: audit timestamps.

Required uniqueness:
- Unique `(source_system, entity_type, legacy_id)` to make retries idempotent.
- Unique `(source_system, entity_type, target_id)` to prevent two source records of the same entity from resolving to one target.
- Never recycle a mapping or silently replace a target UUID after dependent rows have been imported.

Because `target_id` points to different target tables depending on `entity_type`, a generic ledger cannot provide a conventional single-column foreign key to every target table. The ETL validator must verify that each mapped target UUID exists in the correct target table. If stronger database-enforced referential integrity is required, use per-entity mapping tables or a reviewed entity-specific constraint design.

## UUID assignment
- Generate a UUID once for each source entity and persist it in the ledger before inserting dependent rows.
- A deterministic UUIDv5 derived from a fixed, documented namespace plus `source_system/entity_type/legacy_id` is a viable repeatable strategy. The namespace and implementation must be fixed and tested before the first import.
- The ledger remains authoritative even if deterministic generation is used; never regenerate mappings independently in separate import jobs.
- Do not depend on insertion order or PostgreSQL `gen_random_uuid()` for source entities when their IDs must be referenced by later imports.
- Do not expose the mapping ledger through public API routes.

## Import and verification order
1. Freeze and record a source inventory and source counts without modifying MongoDB.
2. Generate or retrieve mappings for all parent/reference entities first: departments, programs, regulations, batches, semesters, subjects, grading policies, and users.
3. Resolve user-to-department links using both user and department mappings; insert into `user_departments`.
4. Map students and their department/program/regulation/batch/current-semester references.
5. Map exam sessions and registrations, then mark entries and their actor IDs.
6. Map processed results and semester summaries.
7. Map publication snapshots and snapshot records while preserving payload values and historical immutability.
8. Reconcile every foreign-key relationship and compare per-entity source/target counts.
9. Verify password hashes and student PIN hashes byte-for-byte; never log or display them.
10. Mark a batch verified only after all its rows, references, checksums, and required application-level invariants pass.

## User identity and JWT compatibility
The current access token carries the Mongo user ObjectId as `userId`. Existing mark-entry and publication services validate and persist that identity through Mongoose `User.findById`; exam-session service code also validates a supplied publication actor as a Mongo ObjectId. PostgreSQL actor columns instead reference UUIDs.

Therefore:
- Keep existing Mongo-issued JWTs and Mongo-backed login active until all actor-consuming modules are migrated together.
- During any later transition, resolve a verified mapping at a single trusted backend boundary; do not let each service invent its own conversion.
- Preserve a clear token-version/provider contract during any overlap period. Never infer identifier type solely from string shape in a way that can silently misroute an identity.
- Test old-token and new-token behavior, refresh, `/me`, inactive users, role checks, department scoping, mark-entry audit fields, publication, and rollback before enabling the new identity path.
- Never issue UUID-based user tokens while active code still calls Mongoose `User.findById` with the token subject.

## Release gates
No mapping ledger DDL, bulk import, authentication cutover, production environment change, MongoDB change, or database deletion is authorized by this design document. Those actions require separate review and explicit approval. Keep RLS enabled and do not add broad `anon` or `authenticated` policies as a shortcut.
