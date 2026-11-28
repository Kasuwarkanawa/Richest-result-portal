import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMigrationBatch } from "./migrationReconciliation.js";

const USER_MAPPING = {
  source_system: "mongodb-rigchest",
  entity_type: "users",
  legacy_id: "507f1f77bcf86cd799439011",
  target_id: "a0b1c2d3-e4f5-4678-9012-abcdef123456",
  mapping_status: "verified",
  verified_at: "2026-11-28T09:00:00.000Z",
  source_checksum: "a".repeat(64),
  target_checksum: "b".repeat(64)
};

test("passes when source, target, and verified mapping counts match", () => {
  const report = reconcileMigrationBatch({
    sourceCounts: { users: 1, students: 0 },
    targetCounts: { users: 1, students: 0 },
    mappingRecords: [USER_MAPPING]
  });
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.entities, [
    { entityType: "students", sourceCount: 0, targetCount: 0, verifiedMappingCount: 0 },
    { entityType: "users", sourceCount: 1, targetCount: 1, verifiedMappingCount: 1 }
  ]);
});

test("fails closed when source and target row counts differ", () => {
  const report = reconcileMigrationBatch({
    sourceCounts: { users: 2 },
    targetCounts: { users: 1 },
    mappingRecords: [USER_MAPPING]
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("source/target row counts differ")));
  assert.ok(report.errors.some((error) => error.includes("verified mapping count differs")));
});

test("fails when a source row has no verified mapping", () => {
  const report = reconcileMigrationBatch({
    sourceCounts: { users: 2 },
    targetCounts: { users: 2 },
    mappingRecords: [{ ...USER_MAPPING, mapping_status: "imported", verified_at: null }]
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("verified mapping count differs")));
});

test("detects unexpected target entities and invalid counts", () => {
  const report = reconcileMigrationBatch({
    sourceCounts: { users: 1 },
    targetCounts: { users: 1, departments: -1 },
    mappingRecords: [USER_MAPPING]
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("departments: target count")));
});

test("rejects missing or malformed audit summaries", () => {
  assert.throws(() => reconcileMigrationBatch({ targetCounts: {}, mappingRecords: [] }), /sourceCounts/);
  assert.throws(() => reconcileMigrationBatch({ sourceCounts: {}, targetCounts: {}, mappingRecords: null }), /mappingRecords/);
});
