import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeterministicTargetUuid,
  normalizeLegacyObjectId,
  resolveVerifiedLegacyId
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
