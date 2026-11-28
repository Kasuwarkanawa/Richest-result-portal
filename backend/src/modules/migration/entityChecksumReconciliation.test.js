import test from "node:test";
import assert from "node:assert/strict";
import { reconcileEntityChecksums } from "./entityChecksumReconciliation.js";

const sourceSystem = "rigchest-mongodb";
const entityType = "students";
const legacyId = "507f1f77bcf86cd799439011";
const targetId = "550e8400-e29b-41d4-a716-446655440000";
const checksum = "a".repeat(64);
const mappingRecords = [{
  source_system: sourceSystem,
  entity_type: entityType,
  legacy_id: legacyId,
  target_id: targetId,
  mapping_status: "verified",
  verified_at: "2026-11-28T10:00:00.000Z",
  source_checksum: checksum,
  target_checksum: checksum
}];

test("matching canonical checksums reconcile without exposing row payloads", () => {
  const result = reconcileEntityChecksums({
    sourceSystem, entityType, mappingRecords,
    sourceRecords: [{ legacyId, checksum }],
    targetRecords: [{ targetId, checksum }]
  });
  assert.equal(result.valid, true);
  assert.equal(result.matchedCount, 1);
  assert.equal("records" in result, false);
});

test("a checksum difference fails reconciliation", () => {
  const result = reconcileEntityChecksums({
    sourceSystem, entityType, mappingRecords,
    sourceRecords: [{ legacyId, checksum }],
    targetRecords: [{ targetId, checksum: "b".repeat(64) }]
  });
  assert.equal(result.valid, false);
  assert.equal(result.checksumMismatchCount, 1);
});

test("missing or unverified mappings fail closed", () => {
  const pending = mappingRecords.map((record) => ({ ...record, mapping_status: "imported" }));
  const result = reconcileEntityChecksums({
    sourceSystem, entityType, mappingRecords: pending,
    sourceRecords: [{ legacyId, checksum }],
    targetRecords: [{ targetId, checksum }]
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /verified UUID mapping/);
});

test("extra target rows are detected", () => {
  const otherId = "550e8400-e29b-41d4-a716-446655440001";
  const result = reconcileEntityChecksums({
    sourceSystem, entityType, mappingRecords,
    sourceRecords: [{ legacyId, checksum }],
    targetRecords: [{ targetId, checksum }, { targetId: otherId, checksum }]
  });
  assert.equal(result.valid, false);
  assert.equal(result.extraTargetCount, 1);
});

test("duplicate source IDs and invalid checksums are rejected", () => {
  const result = reconcileEntityChecksums({
    sourceSystem, entityType, mappingRecords,
    sourceRecords: [{ legacyId, checksum }, { legacyId, checksum: "z" }],
    targetRecords: [{ targetId, checksum }]
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /duplicates a source legacy ID/);
});
