import test from "node:test";
import assert from "node:assert/strict";
import { MIGRATION_ENTITIES } from "./migrationInventory.js";
import { buildCountReconciliationReport } from "./countReconciliationReport.js";

const completeResults = () => MIGRATION_ENTITIES.map(({ entityType }) => ({
  entityType,
  sourceCount: 4,
  targetCount: 4,
  matches: true
}));

test("builds a count-only report for all 18 inventory entities", () => {
  const report = buildCountReconciliationReport(completeResults());
  assert.equal(report.entityCount, 18);
  assert.equal(report.matchedEntityCount, 18);
  assert.equal(report.mismatchedEntityCount, 0);
  assert.equal(report.sourceTotal, 72);
  assert.equal(report.targetTotal, 72);
  assert.equal(report.totalDifference, 0);
  assert.equal(report.allMatched, true);
  assert.deepEqual(report.mismatched, []);
});

test("isolates mismatched entities and reports signed count differences", () => {
  const results = completeResults();
  results[0] = { ...results[0], targetCount: 7, matches: false };
  results[1] = { ...results[1], sourceCount: 8, matches: false };
  const report = buildCountReconciliationReport(results);
  assert.equal(report.matchedEntityCount, 16);
  assert.equal(report.mismatchedEntityCount, 2);
  assert.equal(report.mismatched[0].difference, 3);
  assert.equal(report.mismatched[1].difference, -4);
  assert.equal(report.allMatched, false);
});

test("rejects missing, duplicate, and unknown inventory entities", () => {
  const missing = completeResults().slice(1);
  assert.throws(() => buildCountReconciliationReport(missing), /exactly 18/);

  const duplicate = completeResults();
  duplicate[1] = { ...duplicate[1], entityType: duplicate[0].entityType };
  assert.throws(() => buildCountReconciliationReport(duplicate), /Duplicate/);

  const unknown = completeResults();
  unknown[0] = { ...unknown[0], entityType: "private_records" };
  assert.throws(() => buildCountReconciliationReport(unknown), /not in the migration inventory/);
});

test("rejects unsafe counts and inconsistent match flags", () => {
  const unsafe = completeResults();
  unsafe[0] = { ...unsafe[0], sourceCount: Number.MAX_SAFE_INTEGER + 1 };
  assert.throws(() => buildCountReconciliationReport(unsafe), /non-negative safe integer/);

  const inconsistent = completeResults();
  inconsistent[0] = { ...inconsistent[0], targetCount: 5 };
  assert.throws(() => buildCountReconciliationReport(inconsistent), /inconsistent/);
});

test("rejects aggregate totals that exceed JavaScript safe integer precision", () => {
  const results = completeResults();
  results[0] = { ...results[0], sourceCount: Number.MAX_SAFE_INTEGER, targetCount: Number.MAX_SAFE_INTEGER, matches: true };
  assert.throws(() => buildCountReconciliationReport(results), /Aggregate source and target totals/);
});

test("report exposes only entity names and aggregate counts, never source records", () => {
  const report = buildCountReconciliationReport(completeResults());
  const serialized = JSON.stringify(report);
  for (const field of ["passwordHash", "studentPinHash", "email", "phone", "studentName"]) {
    assert.equal(serialized.includes(field), false);
  }
  assert.deepEqual(Object.keys(report.matched[0]).sort(), ["difference", "entityType", "matches", "sourceCount", "targetCount"]);
  assert.deepEqual(Object.keys(report).sort(), [
    "allMatched", "entityCount", "matched", "matchedEntityCount",
    "mismatched", "mismatchedEntityCount", "sourceTotal", "targetTotal", "totalDifference"
  ]);
});
