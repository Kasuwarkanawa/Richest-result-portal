import test from "node:test";
import assert from "node:assert/strict";
import { reconcileMigrationReferences } from "./referenceReconciliation.js";

const USER = {
  source_system: "mongodb-rigchest", entity_type: "users",
  legacy_id: "507f1f77bcf86cd799439011",
  target_id: "a0b1c2d3-e4f5-4678-9012-abcdef123456",
  mapping_status: "verified", verified_at: "2026-11-28T09:00:00.000Z",
  source_checksum: "a".repeat(64), target_checksum: "b".repeat(64)
};
const DEPARTMENT = {
  source_system: "mongodb-rigchest", entity_type: "departments",
  legacy_id: "507f1f77bcf86cd799439012",
  target_id: "b0b1c2d3-e4f5-4678-9012-abcdef123456",
  mapping_status: "verified", verified_at: "2026-11-28T09:00:00.000Z",
  source_checksum: "c".repeat(64), target_checksum: "d".repeat(64)
};
const BASE = {
  sourceSystem: "mongodb-rigchest",
  mappingRecords: [USER, DEPARTMENT],
  references: [{
    owner_entity_type: "users", owner_legacy_id: USER.legacy_id,
    field: "departmentId", referenced_entity_type: "departments",
    referenced_legacy_id: DEPARTMENT.legacy_id
  }],
  targetIdsByEntity: {
    users: [USER.target_id], departments: [DEPARTMENT.target_id]
  }
};

test("accepts a reference when owner and target have verified mappings and exist", () => {
  const report = reconcileMigrationReferences(BASE);
  assert.equal(report.valid, true);
  assert.deepEqual(report.errors, []);
  assert.equal(report.references[0].ownerTargetId, USER.target_id);
  assert.equal(report.references[0].referencedTargetId, DEPARTMENT.target_id);
});

test("rejects a reference whose legacy target has no mapping", () => {
  const report = reconcileMigrationReferences({
    ...BASE,
    references: [{ ...BASE.references[0], referenced_legacy_id: "507f1f77bcf86cd799439099" }]
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("does not resolve to exactly one mapping")));
});

test("rejects unverified mappings", () => {
  const report = reconcileMigrationReferences({
    ...BASE,
    mappingRecords: [USER, { ...DEPARTMENT, mapping_status: "imported", verified_at: null }]
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("mapping is not verified")));
});

test("rejects a mapped target UUID absent from the target entity set", () => {
  const report = reconcileMigrationReferences({
    ...BASE,
    targetIdsByEntity: { users: [USER.target_id], departments: [] }
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("target UUID is absent")));
});

test("rejects malformed and duplicate target UUID sets", () => {
  const report = reconcileMigrationReferences({
    ...BASE,
    targetIdsByEntity: {
      users: [USER.target_id, USER.target_id, "not-a-uuid"],
      departments: [DEPARTMENT.target_id]
    }
  });
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((error) => error.includes("duplicate UUIDs")));
  assert.ok(report.errors.some((error) => error.includes("invalid UUID")));
});

test("rejects missing required audit inputs", () => {
  assert.throws(() => reconcileMigrationReferences({ ...BASE, references: null }), /references/);
  assert.throws(() => reconcileMigrationReferences({ ...BASE, targetIdsByEntity: [] }), /targetIdsByEntity/);
});
