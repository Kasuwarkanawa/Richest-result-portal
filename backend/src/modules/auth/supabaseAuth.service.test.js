import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createSupabaseAuthService } from "./supabaseAuth.service.js";

const USER_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const ACCESS_SECRET = "test-access-secret-at-least-32-characters";
const REFRESH_SECRET = "test-refresh-secret-at-least-32-characters";
const passwordHash = await bcrypt.hash("CorrectPassword123!", 4);

const makeUser = (overrides = {}) => ({
  id: USER_ID,
  fullName: "Portal Administrator",
  email: "admin@example.edu",
  mobileNo: "08000000000",
  passwordHash,
  role: "SUPER_ADMIN",
  isActive: true,
  lastLoginAt: null,
  ...overrides
});

const makeService = ({ user = makeUser(), departments = [] } = {}) => {
  const calls = [];
  const repository = {
    findUserByNormalizedEmail: async (email) => {
      calls.push(["findByEmail", email]);
      return user;
    },
    findUserById: async (id) => {
      calls.push(["findById", id]);
      return user;
    },
    updateLastLoginAt: async (id, date) => calls.push(["lastLogin", id, date]),
    listDepartmentIdsForUser: async (id) => {
      calls.push(["departments", id]);
      return departments;
    }
  };
  return {
    calls,
    service: createSupabaseAuthService({
      userRepository: repository,
      accessSecret: ACCESS_SECRET,
      refreshSecret: REFRESH_SECRET,
      clock: () => new Date("2026-11-28T10:00:00.000Z")
    })
  };
};

test("login preserves JWT claims, bcrypt verification, UUID subject and public user projection", async () => {
  const { service, calls } = makeService({
    departments: ["11111111-1111-4111-8111-111111111111"]
  });
  const result = await service.loginUser({
    email: " ADMIN@Example.edu ",
    password: "CorrectPassword123!"
  });

  const access = jwt.verify(result.accessToken, ACCESS_SECRET);
  const refresh = jwt.verify(result.refreshToken, REFRESH_SECRET);
  assert.equal(access.userId, USER_ID);
  assert.equal(access.email, "admin@example.edu");
  assert.equal(access.role, "SUPER_ADMIN");
  assert.equal(refresh.userId, USER_ID);
  assert.equal(result.user._id, USER_ID);
  assert.deepEqual(result.user.departmentIds, ["11111111-1111-4111-8111-111111111111"]);
  assert.equal(Object.hasOwn(result.user, "passwordHash"), false);
  assert.equal(calls.some(([name]) => name === "lastLogin"), true);
  assert.equal(calls.some(([name]) => name === "departments"), true);
});

test("login rejects unknown users with the existing generic authentication error", async () => {
  const { service } = makeService({ user: null });
  await assert.rejects(
    service.loginUser({ email: "missing@example.edu", password: "anything" }),
    (error) => error.statusCode === 401 && error.message === "Invalid email or password"
  );
});

test("login rejects inactive users before password verification", async () => {
  const { service } = makeService({ user: makeUser({ isActive: false }) });
  await assert.rejects(
    service.loginUser({ email: "admin@example.edu", password: "CorrectPassword123!" }),
    (error) => error.statusCode === 403 && error.message === "Your account is inactive"
  );
});

test("login rejects incorrect passwords without updating last login", async () => {
  const { service, calls } = makeService();
  await assert.rejects(
    service.loginUser({ email: "admin@example.edu", password: "wrong-password" }),
    (error) => error.statusCode === 401 && error.message === "Invalid email or password"
  );
  assert.equal(calls.some(([name]) => name === "lastLogin"), false);
});

test("getMe returns normalized department memberships and never exposes password hash", async () => {
  const { service } = makeService({
    departments: ["11111111-1111-4111-8111-111111111111"]
  });
  const user = await service.getMe(USER_ID);
  assert.equal(user._id, USER_ID);
  assert.deepEqual(user.departmentIds, ["11111111-1111-4111-8111-111111111111"]);
  assert.equal(Object.hasOwn(user, "passwordHash"), false);
});

test("getMe returns not found for an unknown UUID", async () => {
  const { service } = makeService({ user: null });
  await assert.rejects(
    service.getMe(USER_ID),
    (error) => error.statusCode === 404 && error.message === "User not found"
  );
});
