import test from "node:test";
import assert from "node:assert/strict";
import { MIGRATION_ENTITIES, MIGRATION_INVENTORY_VERSION, validateMigrationInventory } from "./migrationInventory.js";

test("the migration inventory is valid and dependency ordered", () => {
  const result = validateMigrationInventory();
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.entityCount, 18);
  assert.equal(MIGRATION_INVENTORY_VERSION, 1);
});

test("the inventory includes every target table exactly once", () => {
  assert.equal(new Set(MIGRATION_ENTITIES.map((entity) => entity.targetTable)).size, 18);
  assert.deepEqual(
    MIGRATION_ENTITIES.find((entity) => entity.entityType === "user_departments").dependsOn,
    ["users", "departments"]
  );
});

test("sensitive hashes are explicitly classified", () => {
  assert.ok(MIGRATION_ENTITIES.find((entity) => entity.entityType === "users").sensitiveFields.includes("passwordHash"));
  assert.ok(MIGRATION_ENTITIES.find((entity) => entity.entityType === "students").sensitiveFields.includes("studentPinHash"));
});

test("invalid or forward dependencies fail closed", () => {
  const invalid = [
    { entityType: "a", sourceModel: "A", targetTable: "a", dependsOn: ["b"], sensitiveFields: [] },
    { entityType: "b", sourceModel: "B", targetTable: "b", dependsOn: [], sensitiveFields: [] }
  ];
  const result = validateMigrationInventory(invalid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /must appear earlier/);
});
