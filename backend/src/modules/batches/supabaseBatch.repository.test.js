import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseBatchRepository } from "./supabaseBatch.repository.js";

const ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const makeRow = (overrides = {}) => ({
  id: ID, label: "2023-2027", start_year: 2023, end_year: 2027,
  is_active: true, created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z", ...overrides
});

test("requires injected server-only request", () => {
  assert.throws(() => createSupabaseBatchRepository(), /server-side/);
});

test("lists and maps batch records", async () => {
  let call;
  const repository = createSupabaseBatchRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  const rows = await repository.listBatches();
  assert.equal(call.table, "batches");
  assert.match(call.options.query, /order=created_at.desc/);
  assert.equal(rows[0]._id, ID);
  assert.equal(rows[0].startYear, 2023);
  assert.equal(rows[0].endYear, 2027);
});

test("looks up by UUID and rejects Mongo ObjectIds", async () => {
  const repository = createSupabaseBatchRepository({ request: async () => [makeRow()] });
  assert.equal((await repository.findBatchById(ID)).label, "2023-2027");
  await assert.rejects(repository.findBatchById("507f1f77bcf86cd799439011"), /UUID/);
});

test("looks up labels and rejects ambiguous results", async () => {
  let query;
  const repository = createSupabaseBatchRepository({
    request: async (_table, options) => { query = options.query; return [makeRow()]; }
  });
  assert.equal((await repository.findBatchByLabel("2023-2027")).startYear, 2023);
  assert.match(query, /label=eq.2023-2027/);
  const ambiguous = createSupabaseBatchRepository({
    request: async () => [makeRow(), makeRow({ id: "b0b1c2d3-e4f5-4678-9012-abcdef123456" })]
  });
  await assert.rejects(ambiguous.findBatchByLabel("2023-2027"), /more than one batch/);
});

test("creates batch with normalized validated fields", async () => {
  let call;
  const repository = createSupabaseBatchRepository({
    request: async (table, options) => { call = { table, options }; return [makeRow()]; }
  });
  await repository.createBatch({ label: " 2023-2027 ", startYear: 2023, endYear: 2027 });
  assert.deepEqual(call.options.body, {
    label: "2023-2027", start_year: 2023, end_year: 2027, is_active: true
  });
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.prefer, "return=representation");
});

test("rejects invalid years and end years not greater than start years", async () => {
  const repository = createSupabaseBatchRepository({ request: async () => [makeRow()] });
  await assert.rejects(repository.createBatch({ label: "bad", startYear: 1899, endYear: 1903 }), /1900 and 3000/);
  assert.equal((await repository.createBatch({ label: "valid", startYear: 2023, endYear: 2026 })).startYear, 2023);
  await assert.rejects(repository.createBatch({ label: "bad", startYear: 2027, endYear: 2023 }), /greater than/);
});

test("updates supplied fields and validates resulting year range", async () => {
  const calls = [];
  const repository = createSupabaseBatchRepository({
    request: async (_table, options) => {
      calls.push(options);
      if (!options.method) return [makeRow()];
      return [makeRow({ end_year: 2028 })];
    }
  });
  const updated = await repository.updateBatch(ID, { endYear: 2028 });
  assert.equal(updated.endYear, 2028);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body, { end_year: 2028 });
  await assert.rejects(repository.updateBatch(ID, { endYear: 2022 }), /greater than/);
});

test("toggles active state based on the current row", async () => {
  const calls = [];
  const repository = createSupabaseBatchRepository({
    request: async (_table, options) => {
      calls.push(options);
      if (!options.method) return [makeRow({ is_active: true })];
      return [makeRow({ is_active: false })];
    }
  });
  const result = await repository.toggleBatchStatus(ID);
  assert.equal(result.isActive, false);
  assert.deepEqual(calls[1].body, { is_active: false });
});

test("returns null for missing records and rejects empty update or malformed response", async () => {
  const empty = createSupabaseBatchRepository({ request: async () => [] });
  assert.equal(await empty.updateBatch(ID, { label: "Renamed" }), null);
  assert.equal(await empty.toggleBatchStatus(ID), null);
  await assert.rejects(empty.updateBatch(ID, {}), /At least one/);
  const invalid = createSupabaseBatchRepository({ request: async () => ({}) });
  await assert.rejects(invalid.listBatches(), /invalid response/);
});
