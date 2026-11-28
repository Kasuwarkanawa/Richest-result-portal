import test from "node:test";
import assert from "node:assert/strict";
import { createReadOnlyAuditAdapters } from "./readOnlyAuditAdapters.js";
import { MIGRATION_ENTITIES } from "./migrationInventory.js";

const makeModels = (counts = {}) => {
  const models = {};
  for (const entity of MIGRATION_ENTITIES) {
    if (entity.entityType === "user_departments") continue;
    models[entity.sourceModel] = {
      countDocuments(filter) {
        assert.deepEqual(filter, {});
        return { exec: async () => counts[entity.entityType] ?? 4 };
      }
    };
  }
  models.User = {
    aggregate(pipeline) {
      assert.deepEqual(pipeline, [
        { $unwind: "$departmentIds" },
        { $count: "sourceCount" }
      ]);
      return { exec: async () => [{ sourceCount: counts.user_departments ?? 4 }] };
    }
  };
  return models;
};

test("counts one manifest entity using injected read-only functions", async () => {
  const calls = [];
  const adapters = createReadOnlyAuditAdapters({
    models: makeModels({ students: 12 }),
    countTargetRows: async (table) => { calls.push(table); return 12; }
  });
  assert.deepEqual(await adapters.countEntity("students"), {
    entityType: "students", sourceCount: 12, targetCount: 12, matches: true
  });
  assert.deepEqual(calls, ["students"]);
});

test("counts derived user-department links with a read-only aggregation", async () => {
  const adapters = createReadOnlyAuditAdapters({
    models: makeModels({ user_departments: 7 }),
    countTargetRows: async (table) => {
      assert.equal(table, "user_departments");
      return 6;
    }
  });
  assert.deepEqual(await adapters.countEntity("user_departments"), {
    entityType: "user_departments", sourceCount: 7, targetCount: 6, matches: false
  });
});

test("countAll follows the manifest order and returns counts only", async () => {
  const adapters = createReadOnlyAuditAdapters({
    models: makeModels(),
    countTargetRows: async () => 4
  });
  const results = await adapters.countAll();
  assert.deepEqual(results.map((row) => row.entityType), MIGRATION_ENTITIES.map((entity) => entity.entityType));
  assert.ok(results.every((row) => row.sourceCount === 4 && row.targetCount === 4 && row.matches));
  assert.equal(JSON.stringify(results).includes("passwordHash"), false);
  assert.equal(JSON.stringify(results).includes("studentPinHash"), false);
});

test("rejects unknown entities and missing injected dependencies", async () => {
  assert.throws(() => createReadOnlyAuditAdapters({ models: makeModels() }), /countTargetRows/);
  const missingModelAdapters = createReadOnlyAuditAdapters({
    models: {},
    countTargetRows: async () => 0
  });
  await assert.rejects(missingModelAdapters.countEntity("students"), /Missing count-capable Mongo model/);
  const adapters = createReadOnlyAuditAdapters({ models: makeModels(), countTargetRows: async () => 4 });
  await assert.rejects(adapters.countEntity("unknown"), /migration inventory/);
});

test("rejects invalid counts instead of reporting a false comparison", async () => {
  const adapters = createReadOnlyAuditAdapters({
    models: makeModels(),
    countTargetRows: async () => -1
  });
  await assert.rejects(adapters.countEntity("students"), /targetCount/);
});
