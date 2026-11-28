import test from "node:test";
import assert from "node:assert/strict";
import { MIGRATION_ENTITIES } from "./migrationInventory.js";
import { runSupabaseCountReconciliation } from "./runSupabaseCountReconciliation.js";

const createModels = (sourceCount = 5) => {
  const models = {};
  for (const entity of MIGRATION_ENTITIES) {
    if (entity.entityType === "user_departments") {
      models.User ??= {};
      models.User.aggregate = () => ({ exec: async () => [{ sourceCount }] });
    } else {
      models[entity.sourceModel] ??= {};
      models[entity.sourceModel].countDocuments = () => ({ exec: async () => sourceCount });
    }
  }
  return models;
};

const createRequest = (targetCountFor = () => 5, calls = []) => async (table, options) => {
  calls.push({ table, options });
  return { data: [], contentRange: `*/${targetCountFor(table)}` };
};

test("runs an injected count-only audit and returns a complete 18-entity report", async () => {
  const calls = [];
  const report = await runSupabaseCountReconciliation({
    models: createModels(),
    request: createRequest(() => 5, calls)
  });

  assert.equal(report.entityCount, 18);
  assert.equal(report.matchedEntityCount, 18);
  assert.equal(report.mismatchedEntityCount, 0);
  assert.equal(report.allMatched, true);
  assert.equal(calls.length, 18);
  assert.ok(calls.every(({ options }) =>
    options.method === "GET" &&
    options.query === "select=id&limit=0" &&
    options.prefer === "count=exact" &&
    options.includeResponseMetadata === true
  ));
});

test("reports count mismatches without returning source records", async () => {
  const report = await runSupabaseCountReconciliation({
    models: createModels(5),
    request: createRequest((table) => table === "students" ? 7 : 5)
  });

  assert.equal(report.allMatched, false);
  assert.equal(report.mismatchedEntityCount, 1);
  assert.equal(report.mismatched[0].entityType, "students");
  assert.equal(report.mismatched[0].difference, 2);
  assert.equal(JSON.stringify(report).includes("passwordHash"), false);
  assert.equal(JSON.stringify(report).includes("studentPinHash"), false);
});

test("fails closed when an injected source model or target request fails", async () => {
  await assert.rejects(() => runSupabaseCountReconciliation({
    models: {},
    request: createRequest()
  }), /Missing count-capable Mongo model/);

  await assert.rejects(() => runSupabaseCountReconciliation({
    models: createModels(),
    request: async () => { throw new Error("injected target read failed"); }
  }), /injected target read failed/);
});
