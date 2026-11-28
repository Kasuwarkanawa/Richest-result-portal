import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseProgramRepository } from "./supabaseProgram.repository.js";

const PROGRAM_ID = "c0b1c2d3-e4f5-4678-9012-abcdef123456";
const DEPARTMENT_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const makeRow = (overrides = {}) => ({
  id: PROGRAM_ID,
  code: "CHEW",
  name: "Community Health Extension Worker",
  short_name: "CHEW",
  degree_type: "BE",
  duration_in_semesters: 6,
  department_id: DEPARTMENT_ID,
  status: "ACTIVE",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

test("requires an injected server-side request function", () => {
  assert.throws(() => createSupabaseProgramRepository(), /server-side/);
});

test("lists programs and maps PostgreSQL columns to API fields", async () => {
  let call;
  const repository = createSupabaseProgramRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const rows = await repository.listPrograms();
  assert.equal(call.table, "programs");
  assert.match(call.options.query, /order=created_at.desc/);
  assert.equal(rows[0]._id, PROGRAM_ID);
  assert.equal(rows[0].shortName, "CHEW");
  assert.equal(rows[0].durationInSemesters, 6);
  assert.equal(rows[0].departmentId, DEPARTMENT_ID);
});

test("finds programs by UUID and rejects Mongo ObjectIds", async () => {
  let call;
  const repository = createSupabaseProgramRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  assert.equal((await repository.findProgramById(PROGRAM_ID)).code, "CHEW");
  assert.equal(call.table, "programs");
  assert.match(call.options.query, /id=eq\./);
  await assert.rejects(repository.findProgramById("507f1f77bcf86cd799439011"), /UUID/);
});

test("normalizes code lookup and rejects ambiguous matches", async () => {
  let query;
  const repository = createSupabaseProgramRepository({
    request: async (_table, options) => { query = options.query; return [makeRow()]; }
  });
  assert.equal((await repository.findProgramByCode(" chew ")).name, makeRow().name);
  assert.match(query, /code=eq.CHEW/);
  const ambiguous = createSupabaseProgramRepository({
    request: async () => [makeRow(), makeRow({ id: "d0b1c2d3-e4f5-4678-9012-abcdef123456" })]
  });
  await assert.rejects(ambiguous.findProgramByCode("CHEW"), /more than one program/);
});

test("creates a normalized program with a PostgreSQL department UUID", async () => {
  let call;
  const repository = createSupabaseProgramRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const created = await repository.createProgram({
    code: " chew ", name: " CHEW ", shortName: " CHEW ",
    degreeType: "be", durationInSemesters: 6, departmentId: DEPARTMENT_ID
  });
  assert.equal(created.code, "CHEW");
  assert.deepEqual(call.options.body, {
    code: "CHEW", name: "CHEW", short_name: "CHEW", degree_type: "BE",
    duration_in_semesters: 6, department_id: DEPARTMENT_ID, status: "ACTIVE"
  });
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.prefer, "return=representation");
});

test("rejects invalid required fields, Mongo department IDs and invalid academic values", async () => {
  const repository = createSupabaseProgramRepository({ request: async () => [makeRow()] });
  await assert.rejects(repository.createProgram({ name: "Missing code" }), /department ID/);
  await assert.rejects(repository.createProgram({
    code: "CHEW", name: "CHEW", shortName: "CHEW", degreeType: "BE",
    departmentId: "507f1f77bcf86cd799439011"
  }), /UUID/);
  const base = { code: "CHEW", name: "CHEW", shortName: "CHEW", departmentId: DEPARTMENT_ID };
  await assert.rejects(repository.createProgram({ ...base, degreeType: "PHD" }), /Degree type/);
  await assert.rejects(repository.createProgram({ ...base, degreeType: "BE", durationInSemesters: 0 }), /positive integer/);
  await assert.rejects(repository.createProgram({ ...base, degreeType: "BE", status: "DELETED" }), /ACTIVE or INACTIVE/);
});

test("updates only supplied fields and scopes updates by UUID", async () => {
  let call;
  const repository = createSupabaseProgramRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow({ name: "Updated" })]; }
  });
  const updated = await repository.updateProgram(PROGRAM_ID, { name: " Updated " });
  assert.equal(updated.name, "Updated");
  assert.equal(call.options.method, "PATCH");
  assert.deepEqual(call.options.body, { name: "Updated" });
  assert.match(call.options.query, /id=eq\./);
  assert.equal(call.options.prefer, "return=representation");
});

test("validates updated department UUID and academic fields", async () => {
  const repository = createSupabaseProgramRepository({ request: async () => [makeRow()] });
  await assert.rejects(repository.updateProgram(PROGRAM_ID, { departmentId: "507f1f77bcf86cd799439011" }), /UUID/);
  await assert.rejects(repository.updateProgram(PROGRAM_ID, { durationInSemesters: 2.5 }), /positive integer/);
  await assert.rejects(repository.updateProgram(PROGRAM_ID, { degreeType: "PHD" }), /Degree type/);
});

test("returns null for unmatched updates and rejects empty updates or invalid response shapes", async () => {
  const empty = createSupabaseProgramRepository({ request: async () => [] });
  assert.equal(await empty.updateProgram(PROGRAM_ID, { status: "INACTIVE" }), null);
  await assert.rejects(empty.updateProgram(PROGRAM_ID, {}), /At least one/);
  const invalid = createSupabaseProgramRepository({ request: async () => ({}) });
  await assert.rejects(invalid.listPrograms(), /invalid response/);
});
