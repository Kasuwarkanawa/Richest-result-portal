import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseRegulationRepository } from "./supabaseRegulation.repository.js";

const REGULATION_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const makeRow = (overrides = {}) => ({
  id: REGULATION_ID,
  code: "REG-2025",
  name: "2025 Academic Regulation",
  effective_from_batch_year: 2025,
  effective_to_batch_year: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});

test("requires a server-side request function", () => {
  assert.throws(() => createSupabaseRegulationRepository(), /server-side/);
});

test("lists regulations and maps database fields", async () => {
  let call;
  const repository = createSupabaseRegulationRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const rows = await repository.listRegulations();
  assert.equal(call.table, "regulations");
  assert.match(call.options.query, /order=created_at.desc/);
  assert.equal(rows[0]._id, REGULATION_ID);
  assert.equal(rows[0].effectiveFromBatchYear, 2025);
  assert.equal(rows[0].effectiveToBatchYear, null);
});

test("finds by UUID and rejects Mongo ObjectIds", async () => {
  const repository = createSupabaseRegulationRepository({ request: async () => [makeRow()] });
  assert.equal((await repository.findRegulationById(REGULATION_ID)).code, "REG-2025");
  await assert.rejects(repository.findRegulationById("507f1f77bcf86cd799439011"), /UUID/);
});

test("normalizes code lookup and rejects ambiguous rows", async () => {
  let query;
  const repository = createSupabaseRegulationRepository({
    request: async (_table, options) => { query = options.query; return [makeRow()]; }
  });
  assert.equal((await repository.findRegulationByCode(" reg-2025 ")).name, makeRow().name);
  assert.match(query, /code=eq.REG-2025/);
  const ambiguous = createSupabaseRegulationRepository({
    request: async () => [makeRow(), makeRow({ id: "b0b1c2d3-e4f5-4678-9012-abcdef123456" })]
  });
  await assert.rejects(ambiguous.findRegulationByCode("REG-2025"), /more than one regulation/);
});

test("creates normalized regulation and returns inserted row", async () => {
  let call;
  const repository = createSupabaseRegulationRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const created = await repository.createRegulation({
    code: " reg-2025 ", name: " Regulation 2025 ",
    effectiveFromBatchYear: 2025
  });
  assert.equal(created.code, "REG-2025");
  assert.deepEqual(call.options.body, {
    code: "REG-2025", name: "Regulation 2025",
    effective_from_batch_year: 2025, effective_to_batch_year: null, is_active: true
  });
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.prefer, "return=representation");
});

test("rejects invalid years, reversed ranges, and non-boolean active state", async () => {
  const repository = createSupabaseRegulationRepository({ request: async () => [makeRow()] });
  await assert.rejects(repository.createRegulation({ code: "R1", name: "R1", effectiveFromBatchYear: 1899 }), /1900 and 3000/);
  await assert.rejects(repository.createRegulation({
    code: "R1", name: "R1", effectiveFromBatchYear: 2026, effectiveToBatchYear: 2025
  }), /cannot be greater/);
  await assert.rejects(repository.createRegulation({
    code: "R1", name: "R1", effectiveFromBatchYear: 2025, isActive: "yes"
  }), /boolean/);
});

test("updates fields and validates range against existing row", async () => {
  const calls = [];
  const repository = createSupabaseRegulationRepository({
    request: async (table, options) => {
      calls.push({ table, options });
      if (options.method === "GET" || !options.method) return [makeRow()];
      return [makeRow({ effective_to_batch_year: 2028 })];
    }
  });
  const updated = await repository.updateRegulation(REGULATION_ID, { effectiveToBatchYear: 2028 });
  assert.equal(updated.effectiveToBatchYear, 2028);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].options.body, { effective_to_batch_year: 2028 });
  assert.equal(calls[1].options.method, "PATCH");
});

test("returns null when update target does not exist", async () => {
  const repository = createSupabaseRegulationRepository({ request: async () => [] });
  assert.equal(await repository.updateRegulation(REGULATION_ID, { name: "Renamed" }), null);
});

test("rejects empty updates and invalid response shapes", async () => {
  const repository = createSupabaseRegulationRepository({ request: async () => ({}) });
  await assert.rejects(repository.listRegulations(), /invalid response/);
  await assert.rejects(repository.updateRegulation(REGULATION_ID, {}), /At least one/);
});
