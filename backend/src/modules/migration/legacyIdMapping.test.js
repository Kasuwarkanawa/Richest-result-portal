import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeterministicTargetUuid,
  normalizeLegacyObjectId,
  resolveVerifiedLegacyId,
  validateLegacyMappingBatch
} from "./legacyIdMapping.js";

const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
const LEGACY_ID = "507f1f77bcf86cd799439011";
const TARGET_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const BASE = {
  source_system: "mongodb-rigchest",
  entity_type: "users",
  legacy_id: LEGACY_ID,
  target_id: TARGET_ID,
  mapping_status: "verified"
};

test("normalizes valid Mongo ObjectIds without changing their identity", () => {
  assert.equal(normalizeLegacyObjectId(LEGACY_ID.toUpperCase()), LEGACY_ID);
});

test("rejects malformed ObjectIds instead of casting or truncating them", () => {
  for (const value of ["", "507f1f77bcf86cd79943901", "507f1f77bcf86cd799439011zz", TARGET_ID, 123]) {
    assert.throws(() => normalizeLegacyObjectId(value), /ObjectId/);
  }
});

test("generates a stable RFC 4122 version 5 UUID candidate", () => {
  const args = {
    namespaceUuid: NAMESPACE,
    sourceSystem: "mongodb-rigchest",
    entityType: "users",
    legacyId: LEGACY_ID
  };
  const first = createDeterministicTargetUuid(args);
  assert.equal(first, createDeterministicTargetUuid(args));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, createDeterministicTargetUuid({ ...args, entityType: "students" }));
  assert.notEqual(first, createDeterministicTargetUuid({ ...args, sourceSystem: "other-source" }));
});

test("encodes identity fields unambiguously when values contain delimiters", () => {
  const common = { namespaceUuid: NAMESPACE, legacyId: LEGACY_ID };
  const first = createDeterministicTargetUuid({
    ...common, sourceSystem: "a/b", entityType: "c"
  });
  const second = createDeterministicTargetUuid({
    ...common, sourceSystem: "a", entityType: "b/c"
  });
  assert.notEqual(first, second);
});

test("requires an explicit valid namespace and complete mapping identity", () => {
  assert.throws(() => createDeterministicTargetUuid({
    sourceSystem: "mongodb-rigchest", entityType: "users", legacyId: LEGACY_ID
  }), /namespace/);
  assert.throws(() => createDeterministicTargetUuid({
    namespaceUuid: NAMESPACE, sourceSystem: " ", entityType: "users", legacyId: LEGACY_ID
  }), /source system/);
});

test("resolves only an exact verified mapping for the same entity type", () => {
  assert.equal(resolveVerifiedLegacyId({
    records: [BASE], sourceSystem: "mongodb-rigchest", entityType: "users", legacyId: LEGACY_ID
  }), TARGET_ID);
  assert.throws(() => resolveVerifiedLegacyId({
    records: [BASE], sourceSystem: "mongodb-rigchest", entityType: "students", legacyId: LEGACY_ID
  }), /No mapping/);
});

test("does not resolve missing or pending ledger entries", () => {
  const args = { sourceSystem: "mongodb-rigchest", entityType: "users", legacyId: LEGACY_ID };
  assert.throws(() => resolveVerifiedLegacyId({ records: [], ...args }), /No mapping/);
  assert.throws(() => resolveVerifiedLegacyId({
    records: [{ ...BASE, mapping_status: "imported" }], ...args
  }), /not verified/);
});

test("rejects duplicate mappings and invalid target UUIDs", () => {
  const args = { sourceSystem: "mongodb-rigchest", entityType: "users", legacyId: LEGACY_ID };
  assert.throws(() => resolveVerifiedLegacyId({ records: [BASE, BASE], ...args }), /duplicate/);
  assert.throws(() => resolveVerifiedLegacyId({
    records: [{ ...BASE, target_id: LEGACY_ID }], ...args
  }), /invalid target UUID/);
});

test("requires a ledger record array", () => {
  assert.throws(() => resolveVerifiedLegacyId({
    records: null, sourceSystem: "mongodb-rigchest", entityType: "users", legacyId: LEGACY_ID
  }), /array/);
});


test("validates a complete verified batch without mutating its records", () => {
  const verified = {
    ...BASE,
    verified_at: "2026-11-28T09:00:00.000Z",
    source_checksum: "a".repeat(64),
    target_checksum: "b".repeat(64)
  };
  const before = structuredClone(verified);
  assert.deepEqual(validateLegacyMappingBatch([verified]), { valid: true, errors: [] });
  assert.deepEqual(verified, before);
});

test("fails closed for duplicate identities, duplicate targets, and invalid state metadata", () => {
  const verified = {
    ...BASE,
    verified_at: "2026-11-28T09:00:00.000Z",
    source_checksum: "a".repeat(64),
    target_checksum: "b".repeat(64)
  };
  const result = validateLegacyMappingBatch([
    verified,
    { ...verified, legacy_id: "507f1f77bcf86cd799439012" },
    { ...verified, mapping_status: "imported", verified_at: null }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("duplicates a source identity")));
  assert.ok(result.errors.some((error) => error.includes("duplicates a target UUID")));
});

test("requires target IDs for imported mappings and forbids targets on pending mappings", () => {
  const result = validateLegacyMappingBatch([
    { ...BASE, mapping_status: "pending", target_id: TARGET_ID, verified_at: null },
    { ...BASE, mapping_status: "imported", target_id: null, verified_at: null }
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("pending mapping must not have a target_id")));
  assert.ok(result.errors.some((error) => error.includes("requires a valid target UUID")));
});

test("requires checksums and verified timestamp before a mapping can be verified", () => {
  const result = validateLegacyMappingBatch([{ ...BASE, verified_at: null }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("verified_at")));
  assert.ok(result.errors.some((error) => error.includes("source_checksum")));
  assert.ok(result.errors.some((error) => error.includes("target_checksum")));
});

test("rejects non-array batches and malformed records", () => {
  assert.throws(() => validateLegacyMappingBatch(null), /array/);
  const result = validateLegacyMappingBatch([null, { ...BASE, mapping_status: "unknown" }]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("must be an object")));
  assert.ok(result.errors.some((error) => error.includes("mapping_status is invalid")));
});
