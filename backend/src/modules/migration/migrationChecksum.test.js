import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeForChecksum, createMigrationChecksum } from "./migrationChecksum.js";

test("canonicalization ignores object key insertion order", () => {
  assert.equal(
    canonicalizeForChecksum({ z: 1, a: { y: 2, x: 3 } }),
    canonicalizeForChecksum({ a: { x: 3, y: 2 }, z: 1 })
  );
  assert.equal(
    createMigrationChecksum({ z: 1, a: 2 }),
    createMigrationChecksum({ a: 2, z: 1 })
  );
});

test("preserves array order and normalizes negative zero", () => {
  assert.notEqual(createMigrationChecksum([1, 2]), createMigrationChecksum([2, 1]));
  assert.equal(canonicalizeForChecksum(-0), "0");
});

test("normalizes valid dates to ISO timestamps", () => {
  assert.equal(
    canonicalizeForChecksum({ createdAt: new Date("2026-11-28T09:00:00.000Z") }),
    '{"createdAt":"2026-11-28T09:00:00.000Z"}'
  );
});

test("returns a lowercase 64-character SHA-256 checksum", () => {
  const checksum = createMigrationChecksum({ id: "sample", active: true });
  assert.match(checksum, /^[0-9a-f]{64}$/);
});

test("rejects values that JSON serialization could silently discard or alter", () => {
  assert.throws(() => canonicalizeForChecksum({ field: undefined }), /undefined/);
  assert.throws(() => canonicalizeForChecksum([undefined]), /undefined/);
  assert.throws(() => canonicalizeForChecksum(Number.NaN), /non-finite/);
  assert.throws(() => canonicalizeForChecksum(Infinity), /non-finite/);
  assert.throws(() => canonicalizeForChecksum(1n), /unsupported value/);
  assert.throws(() => canonicalizeForChecksum(new Map()), /unsupported object type/);
  assert.throws(() => canonicalizeForChecksum(new Date("invalid")), /invalid Date/);
});
