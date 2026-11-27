import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseUserRepository,
  toPublicSupabaseUser
} from "./supabaseUser.repository.js";

const USER_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";

const makeUserRow = (overrides = {}) => ({
  id: USER_ID,
  full_name: "Portal Administrator",
  email: "admin@example.edu",
  mobile_no: "08000000000",
  password_hash: "$2b$10$existing-bcrypt-hash",
  role: "SUPER_ADMIN",
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

test("normalizes email and returns the existing bcrypt hash only to server code", async () => {
  const calls = [];
  const repository = createSupabaseUserRepository({
    request: async (table, options) => {
      calls.push({ table, options });
      return [makeUserRow()];
    }
  });

  const user = await repository.findUserByNormalizedEmail("  ADMIN@Example.edu ");
  assert.equal(user.email, "admin@example.edu");
  assert.equal(user.passwordHash, "$2b$10$existing-bcrypt-hash");
  assert.equal(calls[0].table, "users");
  assert.match(calls[0].options.query, /email=eq\.admin%40example\.edu/);
});

test("returns null when a user does not exist", async () => {
  const repository = createSupabaseUserRepository({
    request: async () => []
  });
  assert.equal(await repository.findUserByNormalizedEmail("missing@example.edu"), null);
});

test("rejects duplicate user lookup results instead of choosing an arbitrary account", async () => {
  const repository = createSupabaseUserRepository({
    request: async () => [makeUserRow(), makeUserRow({ id: "b0b1c2d3-e4f5-4678-9012-abcdef123456" })]
  });
  await assert.rejects(
    repository.findUserByNormalizedEmail("admin@example.edu"),
    /more than one user/
  );
});

test("rejects malformed response shapes", async () => {
  const repository = createSupabaseUserRepository({
    request: async () => ({ id: USER_ID })
  });
  await assert.rejects(
    repository.findUserById(USER_ID),
    /invalid response/
  );
});

test("requires UUIDs and never treats Mongo ObjectIds as PostgreSQL UUIDs", async () => {
  const repository = createSupabaseUserRepository({ request: async () => [] });
  await assert.rejects(repository.findUserById("507f1f77bcf86cd799439011"), /UUID/);
  await assert.rejects(repository.listDepartmentIdsForUser("507f1f77bcf86cd799439011"), /UUID/);
});

test("loads department memberships from the join table", async () => {
  const calls = [];
  const repository = createSupabaseUserRepository({
    request: async (table, options) => {
      calls.push({ table, options });
      return [{ department_id: "11111111-1111-4111-8111-111111111111" }];
    }
  });
  const ids = await repository.listDepartmentIdsForUser(USER_ID);
  assert.deepEqual(ids, ["11111111-1111-4111-8111-111111111111"]);
  assert.equal(calls[0].table, "user_departments");
  assert.match(calls[0].options.query, /user_id=eq\./);
});

test("updates last login only through a UUID-scoped server request", async () => {
  let call;
  const repository = createSupabaseUserRepository({
    request: async (table, options) => { call = { table, options }; return null; }
  });
  await repository.updateLastLoginAt(USER_ID, "2026-11-27T10:00:00.000Z");
  assert.equal(call.table, "users");
  assert.equal(call.options.method, "PATCH");
  assert.deepEqual(call.options.body, { last_login_at: "2026-11-27T10:00:00.000Z" });
  assert.equal(call.options.prefer, "return=minimal");
});

test("rejects invalid last-login timestamps", async () => {
  const repository = createSupabaseUserRepository({ request: async () => null });
  await assert.rejects(repository.updateLastLoginAt(USER_ID, "not-a-date"), /timestamp/);
});

test("public user projection never exposes password hashes", () => {
  const user = {
    ...makeUserRow(),
    ...{
      id: USER_ID,
      fullName: "Portal Administrator",
      mobileNo: "08000000000",
      passwordHash: "$2b$10$secret"
    }
  };
  const safe = toPublicSupabaseUser(user, ["dept-uuid"]);
  assert.equal(safe._id, USER_ID);
  assert.deepEqual(safe.departmentIds, ["dept-uuid"]);
  assert.equal(Object.hasOwn(safe, "passwordHash"), false);
  const safeFromRawRow = toPublicSupabaseUser({ ...makeUserRow(), id: USER_ID });
  assert.equal(Object.hasOwn(safeFromRawRow, "password_hash"), false);
});
