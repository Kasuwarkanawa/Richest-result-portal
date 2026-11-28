# RIGCHEST authentication and user migration design

## Status
Design-only checkpoint on `migration/supabase-postgres`. This document does not change runtime behavior, database schema, credentials, or deployment configuration. MongoDB remains the active production identity store.

## Verified current behavior
- `POST /api/auth/login` uses MongoDB `User.findOne({ email })` and `bcrypt.compare`.
- Access JWT claims are `userId`, `email`, and `role`; refresh JWT currently contains `userId`.
- `GET /api/auth/me` loads the account through MongoDB `User.findById`.
- The auth middleware verifies the access JWT and assigns its decoded claims to `req.user`; it does not currently reload the user or re-check `isActive`.
- Roles are `SUPER_ADMIN`, `EXAM_CELL_ADMIN`, `DEPARTMENT_ADMIN`, `DATA_ENTRY_OPERATOR`, and `VERIFIER`.
- Mongo `User.departmentIds[]` is a list of Mongo ObjectIds. Supabase stores these relations in `user_departments(user_id, department_id)`.
- Supabase `users.id` and the join-table keys are UUIDs. Supabase target tables are empty at this checkpoint and RLS is enabled.

## Downstream identity dependencies discovered
Changing the JWT `userId` claim from a Mongo ObjectId to a UUID is not an isolated auth change:
- Mark-entry create/import/upsert, verify, and lock controllers pass `req.user.userId` to services that persist actor IDs.
- Publication and rollback controllers pass `req.user.userId` as `actorUserId`. The current publication service validates it with Mongo `User.findById` and stores it in snapshot/audit references.
- The relational target schema has user foreign keys for exam-session publication actor, mark-entry entered/verified/locked actors, and publish-snapshot published/rolled-back actors.
- Department-scoped authorization must preserve the user's department memberships, not merely their role.

Therefore, enabling Supabase-issued UUID user IDs while these Mongoose services remain active would break actor validation, ObjectId validation, or Mongo references. Do not enable a Supabase auth provider as a standalone cutover.

## Required identity mapping
Use one deterministic, auditable mapping for each legacy entity ID. Mongo ObjectIds must never be parsed or cast as UUIDs. Before data import, define and test a mapping ledger that records at least:
- source collection/entity name;
- original Mongo ObjectId as text;
- destination UUID;
- migration batch/version and verification status.

The mapping must be unique in both directions for each entity, repeatable on reruns, and applied consistently to every foreign key. A single global map must include users and departments so `user_departments` can be reconstructed without guessing. Do not add a schema migration or write production data until the mapping design and all dependent references are reviewed.

## Safe staged implementation
1. Keep `MONGODB` as the default auth provider. Add isolated repository interfaces and tests without changing the existing login path.
2. Implement a Supabase user repository using the server-only service-role adapter. Select only required user fields; never return `password_hash`.
3. Implement department membership reads through `user_departments`, returning the existing API-compatible `departmentIds` representation expected by the application. Define whether IDs in API responses remain legacy IDs during the transition or become UUIDs only after every dependent module has migrated.
4. Preserve bcrypt hashes and verify existing hashes with `bcrypt.compare`; do not reset passwords or move to Supabase Auth as part of this migration.
5. Preserve role values, inactive-account rejection, normalized email lookup, token expiry settings, response envelope, and refresh-token behavior.
6. Design explicit token-version/provider handling. Existing Mongo-ID tokens must remain resolvable during the transition. Do not silently reinterpret a Mongo ObjectId claim as a UUID.
7. Migrate all consumers that write or validate user actor IDs—including mark-entry audit fields, exam-session publication actor, and snapshot publication/rollback actors—before allowing UUID identity tokens on those routes.
8. Add tests for active/inactive accounts, valid/invalid bcrypt passwords, role authorization, department membership, legacy access tokens, new tokens, and actor foreign-key integrity.
9. Enable Supabase auth only in an isolated Preview environment after those tests pass. Production remains MongoDB until a separately approved cutover.

## Explicit prohibitions
- Do not disable RLS, add broad public policies, or expose service-role credentials.
- Do not change MongoDB network access, production environment variables, `main`, or live deployments.
- Do not merge PR #3, delete MongoDB, import live data, or cut over without explicit user authorization.
- Do not claim authentication migration is complete based on adapter connectivity or syntax checks alone.
