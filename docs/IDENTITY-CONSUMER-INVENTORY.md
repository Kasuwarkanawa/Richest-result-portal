# RIGCHEST identity consumer inventory and migration test plan

## Status
Read-only inventory and implementation plan for `migration/supabase-postgres`. No application runtime behavior or database objects are changed by this document.

## Current implementation facts
- Backend package uses Node.js ES modules and the built-in `node --test` runner (`npm test`).
- Current authentication service uses MongoDB `User.findOne`, `bcrypt.compare`, Mongo-backed `lastLoginAt` update, and Mongo `User.findById` for `/me`.
- Access JWT claims are `userId`, `email`, and `role`; refresh JWT contains `userId`.
- Auth middleware verifies JWT and assigns decoded claims to `req.user`; it does not re-fetch the account or re-check whether it is active.
- User department memberships are Mongo ObjectIds in `departmentIds[]`; the relational target stores memberships in `user_departments(user_id, department_id)`.
- The relational `users.id` and actor columns are UUIDs. All 18 public tables currently have RLS enabled and are empty.

## Verified identity-consuming services

| Module | Current Mongo identity behavior | Required migration treatment |
|---|---|---|
| Auth | Email lookup, bcrypt verification, last-login update, access/refresh JWT, `/me` lookup | Preserve hashes, token contract, active-account behavior and response shape; dual identity must be explicit |
| Mark Entries | `ensureUserExists` validates ObjectId and calls `User.findById`; writes entered/verified/locked actor refs | Move actor validation and actor FK writes together with mark-entry CRUD/import/verify/lock |
| Publication | Validates actor with `User.findById`; writes snapshot published/rolled-back actors | Move publish and rollback actor validation/writes with immutable snapshot behavior |
| Exam Sessions | Validates optional `resultPublishedBy` as ObjectId and populates user details | Migrate publication actor read/write and user population in the same release |

The current controllers pass `req.user.userId` to mark-entry and publication services. The target database enforces user FKs on:
- `exam_sessions.result_published_by`
- `mark_entries.entered_by`, `verified_by`, `locked_by`
- `publish_snapshots.published_by`, `rolled_back_by`
- `user_departments.user_id`

## Required migration order
1. Keep MongoDB as the active auth and identity provider.
2. Complete and approve the legacy ObjectId-to-UUID mapping ledger design before any data import.
3. Build a Supabase user repository behind a separate module boundary; do not wire it into the existing login path yet.
4. Add unit tests using dependency injection or mocked PostgREST calls. Tests must not need production credentials or a live database.
5. Implement and test department membership resolution via `user_departments`.
6. Port mark-entry actor validation and writes, exam-session publication actor handling, and publication/rollback actor handling as one coordinated identity-consumer migration.
7. Only after all consumers use a canonical mapped identity should a Preview-only auth provider be considered.

## Required repository contract (proposed)
The isolated Supabase repository should expose only narrow operations:
- `findUserByNormalizedEmail(email)`
- `findUserById(uuid)`
- `listDepartmentIdsForUser(uuid)`
- `updateLastLoginAt(uuid, timestamp)`

Repository rules:
- Normalize email with trim + lowercase before lookup.
- Select only fields needed by auth; never include `password_hash` in API response objects.
- Return password hash only to the server-side password-verification boundary; never log it.
- Preserve `bcrypt.compare` compatibility with existing hashes.
- Treat missing/duplicate user records as explicit errors; rely on database uniqueness but still validate response cardinality.
- Resolve department IDs using the join table; do not assume a JSON array exists on `users`.
- Do not translate IDs implicitly. Any legacy ObjectId lookup must use the approved mapping ledger.
- Use the service-role key only on the backend. Keep RLS enabled and never add broad public grants as a workaround.

## Test matrix before wiring the repository
1. Email is trimmed and lowercased consistently.
2. Existing bcrypt hashes validate unchanged; invalid passwords fail without revealing whether the email exists.
3. Inactive accounts are rejected.
4. User lookup returns no password hash in public DTOs.
5. Department memberships are read from the join table and preserve the expected API representation.
6. Last-login update is performed only after successful password verification.
7. Missing user, duplicate lookup response, PostgREST non-2xx response, malformed JSON, and network failure are handled safely.
8. Legacy Mongo ObjectId tokens continue to follow the existing Mongo path during transition.
9. UUID identity tokens are rejected by any route/service that still expects Mongo ObjectIds; no heuristic ID casting.
10. Mark-entry entered/verified/locked actors resolve to the correct user UUID.
11. Exam-session result publisher resolves to the correct user UUID.
12. Publish and rollback actor FKs resolve correctly.
13. Department/role authorization behavior is unchanged.
14. Snapshot payloads and historical records remain immutable and byte/value equivalent after migration.
15. Preview end-to-end tests cover login, refresh, `/me`, department-scoped access, marks, publication, rollback, public lookup, and print/export.

## Explicit release gates
- Unit tests pass without real production credentials.
- Source-to-target mapping ledger is complete and reconciled.
- Every foreign key resolves to the correct mapped entity.
- Source/target row counts and checksums match.
- Preview end-to-end tests pass.
- No Production, `main`, MongoDB network, or MongoDB data changes without separate explicit authorization.
- Do not merge PR #3, delete MongoDB, or claim cutover complete before approval.
