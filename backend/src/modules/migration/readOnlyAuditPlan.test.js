import test from "node:test";
import assert from "node:assert/strict";
import {
  createReadOnlyAuditPlan,
  createReadOnlyAuditPlanForAll
} from "./readOnlyAuditPlan.js";
import { MIGRATION_ENTITIES } from "./migrationInventory.js";

test("creates a read-only count plan from the approved inventory", () => {
  const plan = createReadOnlyAuditPlan({ entityType: "students" });
  assert.equal(plan.mode, "read-only-count-audit");
  assert.equal(plan.source.operation, "countDocuments");
  assert.equal(plan.target.operation, "count");
  assert.equal(plan.target.table, "students");
  assert.equal(plan.pageSize, 500);
  assert.deepEqual(plan.prohibited.includes("delete"), true);
  assert.equal(Object.hasOwn(plan, "credentials"), false);
  assert.equal(Object.hasOwn(plan, "records"), false);
});

test("supports bounded pagination metadata without constructing write operations", () => {
  const plan = createReadOnlyAuditPlan({ entityType: "mark_entries", pageSize: 250, offset: 1000 });
  assert.equal(plan.pageSize, 250);
  assert.equal(plan.offset, 1000);
  assert.equal(plan.source.operation, "countDocuments");
  assert.equal(plan.target.operation, "count");
});

test("rejects unknown entities and invalid pagination", () => {
  assert.throws(() => createReadOnlyAuditPlan({ entityType: "unknown" }), /migration inventory/);
  assert.throws(() => createReadOnlyAuditPlan({ entityType: "students", pageSize: 0 }), /pageSize/);
  assert.throws(() => createReadOnlyAuditPlan({ entityType: "students", pageSize: 5001 }), /pageSize/);
  assert.throws(() => createReadOnlyAuditPlan({ entityType: "students", offset: -1 }), /offset/);
  assert.throws(() => createReadOnlyAuditPlan({ entityType: "students", offset: 1.5 }), /offset/);
});

test("creates one ordered plan for every inventory entity", () => {
  const plans = createReadOnlyAuditPlanForAll();
  assert.equal(plans.length, MIGRATION_ENTITIES.length);
  assert.deepEqual(plans.map((plan) => plan.entityType), MIGRATION_ENTITIES.map((item) => item.entityType));
  assert.ok(plans.every((plan) => plan.source.operation === "countDocuments" && plan.target.operation === "count"));
});

test("does not expose sensitive-field names or row payloads in plans", () => {
  const plan = createReadOnlyAuditPlan({ entityType: "users" });
  assert.equal(JSON.stringify(plan).includes("passwordHash"), false);
  assert.equal(JSON.stringify(plan).includes("studentPinHash"), false);
  assert.equal(JSON.stringify(plan).includes("records"), false);
});
