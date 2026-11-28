import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseDepartmentRepository } from "./supabaseDepartment.repository.js";

const DEPARTMENT_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const makeRow = (overrides = {}) => ({
  id: DEPARTMENT_ID,
  code: "ICT",
  name: "Information and Communication Technology",
  short_name: "ICT",
  status: "ACTIVE",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

test("requires a server-side request function", () => {
  assert.throws(() => createSupabaseDepartmentRepository(), /server-side/);
});

test("lists departments and maps database columns to API fields", async () => {
  let call;
  const repository = createSupabaseDepartmentRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const rows = await repository.listDepartments();
  assert.equal(call.table, "departments");
  assert.match(call.options.query, /order=created_at.desc/);
  assert.equal(rows[0]._id, DEPARTMENT_ID);
  assert.equal(rows[0].shortName, "ICT");
});

test("finds a department by UUID and rejects Mongo ObjectIds", async () => {
  let call;
  const repository = createSupabaseDepartmentRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  assert.equal((await repository.findDepartmentById(DEPARTMENT_ID)).code, "ICT");
  assert.equal(call.table, "departments");
  assert.match(call.options.query, /id=eq\./);
  await assert.rejects(repository.findDepartmentById("507f1f77bcf86cd799439011"), /UUID/);
});

test("normalizes department code lookup and rejects ambiguous results", async () => {
  let query;
  const repository = createSupabaseDepartmentRepository({
    request: async (_table, options) => { query = options.query; return [makeRow()]; }
  });
  assert.equal((await repository.findDepartmentByCode(" ict ")).name, makeRow().name);
  assert.match(query, /code=eq.ICT/);

  const ambiguous = createSupabaseDepartmentRepository({
    request: async () => [makeRow(), makeRow({ id: "b0b1c2d3-e4f5-4678-9012-abcdef123456" })]
  });
  await assert.rejects(ambiguous.findDepartmentByCode("ICT"), /more than one department/);
});

test("creates normalized department records and requests the inserted row", async () => {
  let call;
  const repository = createSupabaseDepartmentRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const created = await repository.createDepartment({
    code: " ict ", name: " ICT Department ", shortName: " ICT "
  });
  assert.equal(created.code, "ICT");
  assert.deepEqual(call.options.body, {
    code: "ICT",
    name: "ICT Department",
    short_name: "ICT",
    status: "ACTIVE"
  });
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.prefer, "return=representation");
});

test("rejects missing department names, codes, and invalid statuses", async () => {
  const repository = createSupabaseDepartmentRepository({ request: async () => [makeRow()] });
  await assert.rejects(repository.createDepartment({ name: "Missing code" }), /Department code/);
  await assert.rejects(repository.createDepartment({ code: "ICT" }), /Department name/);
  await assert.rejects(repository.createDepartment({
    code: "ICT", name: "ICT", status: "DELETED"
  }), /ACTIVE or INACTIVE/);
});

test("updates only supplied fields and scopes the write to a UUID", async () => {
  let call;
  const repository = createSupabaseDepartmentRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow({ name: "Updated" })]; }
  });
  const updated = await repository.updateDepartment(DEPARTMENT_ID, { name: " Updated " });
  assert.equal(updated.name, "Updated");
  assert.equal(call.options.method, "PATCH");
  assert.deepEqual(call.options.body, { name: "Updated" });
  assert.match(call.options.query, /id=eq\./);
  assert.equal(call.options.prefer, "return=representation");
});

test("returns null when an update matches no department", async () => {
  const repository = createSupabaseDepartmentRepository({ request: async () => [] });
  assert.equal(await repository.updateDepartment(DEPARTMENT_ID, { status: "INACTIVE" }), null);
});

test("rejects empty updates and invalid response shapes", async () => {
  const repository = createSupabaseDepartmentRepository({ request: async () => ({}) });
  await assert.rejects(repository.listDepartments(), /invalid response/);
  await assert.rejects(repository.updateDepartment(DEPARTMENT_ID, {}), /At least one/);
});
