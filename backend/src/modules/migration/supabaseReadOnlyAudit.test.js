import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseReadOnlyAuditAdapters } from "./supabaseReadOnlyAudit.js";
import { MIGRATION_ENTITIES } from "./migrationInventory.js";

test("composes Mongo counts with allowlisted exact Supabase counts", async () => {
  const student = MIGRATION_ENTITIES.find((entity) => entity.entityType === "students");
  const models = {
    [student.sourceModel]: {
      countDocuments: (filter) => {
        assert.deepEqual(filter, {});
        return { exec: async () => 19 };
      }
    }
  };
  const calls = [];
  const audit = createSupabaseReadOnlyAuditAdapters({
    models,
    request: async (table, options) => {
      calls.push({ table, options });
      return { data: [], contentRange: "*/19" };
    }
  });

  assert.deepEqual(await audit.countEntity("students"), {
    entityType: "students",
    sourceCount: 19,
    targetCount: 19,
    matches: true
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, student.targetTable);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.prefer, "count=exact");
});

test("composition rejects a non-inventory Supabase table through the count adapter", async () => {
  const student = MIGRATION_ENTITIES.find((entity) => entity.entityType === "students");
  const audit = createSupabaseReadOnlyAuditAdapters({
    models: {
      [student.sourceModel]: {
        countDocuments: () => ({ exec: async () => 0 })
      }
    },
    request: async () => ({ data: [], contentRange: "*/0" })
  });
  await assert.rejects(() => audit.countEntity("not_a_table"), /migration inventory/);
});
