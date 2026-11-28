import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseSemesterRepository } from "./supabaseSemester.repository.js";
const ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const makeRow = (overrides = {}) => ({
  id: ID, number: 1, label: "First Semester", display_order: 1, is_active: true,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", ...overrides
});

test("requires injected server-side request", () => assert.throws(() => createSupabaseSemesterRepository(), /server-side/));
test("lists semesters in display order and maps fields", async () => {
  let call;
  const repo = createSupabaseSemesterRepository({ request: async (table, options) => { call = { table, options }; return [makeRow()]; } });
  const rows = await repo.listSemesters();
  assert.equal(call.table, "semesters");
  assert.match(call.options.query, /display_order.asc/);
  assert.equal(rows[0].displayOrder, 1);
  assert.equal(rows[0]._id, ID);
});
test("finds by UUID and number, rejects Mongo ObjectIds", async () => {
  const repo = createSupabaseSemesterRepository({ request: async () => [makeRow()] });
  assert.equal((await repo.findSemesterById(ID)).number, 1);
  assert.equal((await repo.findSemesterByNumber(1)).label, "First Semester");
  await assert.rejects(repo.findSemesterById("507f1f77bcf86cd799439011"), /UUID/);
});
test("creates normalized semester", async () => {
  let call;
  const repo = createSupabaseSemesterRepository({ request: async (table, options) => { call = options; return [makeRow()]; } });
  await repo.createSemester({ number: 1, label: " First Semester ", displayOrder: 1 });
  assert.deepEqual(call.body, { number: 1, label: "First Semester", display_order: 1, is_active: true });
  assert.equal(call.method, "POST");
});
test("rejects invalid semester positions and labels", async () => {
  const repo = createSupabaseSemesterRepository({ request: async () => [makeRow()] });
  await assert.rejects(repo.createSemester({ number: 0, label: "First", displayOrder: 1 }), /between 1 and 20/);
  await assert.rejects(repo.createSemester({ number: 21, label: "First", displayOrder: 1 }), /between 1 and 20/);
  await assert.rejects(repo.createSemester({ number: 1, label: " ", displayOrder: 1 }), /label is required/);
});
test("updates only provided fields and validates status", async () => {
  let call;
  const repo = createSupabaseSemesterRepository({ request: async (_table, options) => { call = options; return [makeRow({ label: "Updated" })]; } });
  const updated = await repo.updateSemester(ID, { label: " Updated " });
  assert.equal(updated.label, "Updated");
  assert.deepEqual(call.body, { label: "Updated" });
  await assert.rejects(repo.updateSemester(ID, { isActive: "yes" }), /boolean/);
});
test("toggles active state", async () => {
  const calls = [];
  const repo = createSupabaseSemesterRepository({ request: async (_table, options) => {
    calls.push(options);
    return options.method ? [makeRow({ is_active: false })] : [makeRow({ is_active: true })];
  }});
  assert.equal((await repo.toggleSemesterStatus(ID)).isActive, false);
  assert.deepEqual(calls[1].body, { is_active: false });
});
test("handles missing records, empty updates, and invalid responses", async () => {
  const empty = createSupabaseSemesterRepository({ request: async () => [] });
  assert.equal(await empty.updateSemester(ID, { label: "Missing" }), null);
  assert.equal(await empty.toggleSemesterStatus(ID), null);
  await assert.rejects(empty.updateSemester(ID, {}), /At least one/);
  const invalid = createSupabaseSemesterRepository({ request: async () => ({}) });
  await assert.rejects(invalid.listSemesters(), /invalid response/);
});
