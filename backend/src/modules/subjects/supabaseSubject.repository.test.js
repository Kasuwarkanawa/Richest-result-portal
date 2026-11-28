import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseSubjectRepository } from "./supabaseSubject.repository.js";

const ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const makeRow = (overrides = {}) => ({
  id: ID, code: "CHE101", name: "Introduction to Chemistry", short_name: "Chemistry",
  subject_type: "THEORY", credits: "3", internal_max: "20", external_max: "80",
  total_max: "100", has_internal: true, has_external: true, is_active: true,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});
const valid = (overrides = {}) => ({
  code: " che101 ", name: " Introduction to Chemistry ", shortName: " Chemistry ",
  subjectType: "THEORY", credits: 3, internalMax: 20, externalMax: 80, totalMax: 100,
  hasInternal: true, hasExternal: true, ...overrides
});

test("requires injected server-side request", () => assert.throws(() => createSupabaseSubjectRepository(), /server-side/));
test("lists subjects newest first and maps PostgreSQL fields", async () => {
  let call;
  const repo = createSupabaseSubjectRepository({ request: async (table, options) => { call = { table, options }; return [makeRow()]; } });
  const rows = await repo.listSubjects();
  assert.equal(call.table, "subjects");
  assert.match(call.options.query, /created_at.desc/);
  assert.equal(rows[0]._id, ID);
  assert.equal(rows[0].internalMax, 20);
  assert.equal(rows[0].credits, 3);
});
test("finds by UUID and normalized code; rejects Mongo ObjectIds", async () => {
  let query;
  const repo = createSupabaseSubjectRepository({ request: async (_table, options) => { query = options.query; return [makeRow()]; } });
  assert.equal((await repo.findSubjectById(ID)).code, "CHE101");
  assert.equal((await repo.findSubjectByCode(" che101 ")).name, "Introduction to Chemistry");
  assert.match(query, /CHE101/);
  await assert.rejects(repo.findSubjectById("507f1f77bcf86cd799439011"), /UUID/);
});
test("creates normalized subject with inferred component flags", async () => {
  let call;
  const repo = createSupabaseSubjectRepository({ request: async (_table, options) => { call = options; return [makeRow()]; } });
  await repo.createSubject(valid({ hasInternal: undefined, hasExternal: undefined }));
  assert.equal(call.method, "POST");
  assert.equal(call.body.code, "CHE101");
  assert.equal(call.body.name, "Introduction to Chemistry");
  assert.equal(call.body.short_name, "Chemistry");
  assert.equal(call.body.is_active, true);
  assert.equal(call.body.has_internal, true);
});
test("enforces subject type, marks, credits, and component rules", async () => {
  const repo = createSupabaseSubjectRepository({ request: async () => [makeRow()] });
  await assert.rejects(repo.createSubject(valid({ subjectType: "UNKNOWN" })), /Invalid subject type/);
  await assert.rejects(repo.createSubject(valid({ credits: 21 })), /Credits.*0 and 20/);
  await assert.rejects(repo.createSubject(valid({ totalMax: 99 })), /must equal/);
  await assert.rejects(repo.createSubject(valid({ subjectType: "NON_CREDIT", credits: 1 })), /0 credits/);
  await assert.rejects(repo.createSubject(valid({ hasInternal: false })), /Internal max must be 0/);
  await assert.rejects(repo.createSubject(valid({ hasExternal: false })), /External max must be 0/);
});
test("updates partial fields only after validating the complete resulting subject", async () => {
  const calls = [];
  const repo = createSupabaseSubjectRepository({ request: async (_table, options) => {
    calls.push(options);
    return options.method ? [makeRow({ name: "Updated Chemistry" })] : [makeRow()];
  }});
  const updated = await repo.updateSubject(ID, { name: " Updated Chemistry " });
  assert.equal(updated.name, "Updated Chemistry");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { code: "CHE101", name: "Updated Chemistry", short_name: "Chemistry", subject_type: "THEORY", credits: 3, internal_max: 20, external_max: 80, total_max: 100, has_internal: true, has_external: true });
  await assert.rejects(repo.updateSubject(ID, { hasInternal: false }), /Internal max must be 0/);
});
test("updates active status and toggles from current value", async () => {
  const calls = [];
  const repo = createSupabaseSubjectRepository({ request: async (_table, options) => {
    calls.push(options);
    return options.method ? [makeRow({ is_active: false })] : [makeRow()];
  }});
  const updated = await repo.updateSubject(ID, { isActive: false });
  assert.equal(updated.isActive, false);
  assert.equal(calls[1].body.is_active, false);
  assert.equal((await repo.toggleSubjectStatus(ID)).isActive, false);
});
test("returns null for missing subjects and rejects malformed responses", async () => {
  const empty = createSupabaseSubjectRepository({ request: async () => [] });
  assert.equal(await empty.updateSubject(ID, { name: "Missing" }), null);
  assert.equal(await empty.toggleSubjectStatus(ID), null);
  const invalid = createSupabaseSubjectRepository({ request: async () => ({}) });
  await assert.rejects(invalid.listSubjects(), /invalid response/);
});
