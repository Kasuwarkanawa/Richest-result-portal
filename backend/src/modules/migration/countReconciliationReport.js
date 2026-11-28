import { MIGRATION_ENTITIES } from "./migrationInventory.js";

/**
 * Build a privacy-safe, in-memory reconciliation summary from count-only
 * audit results. This function performs no database I/O.
 */
export const buildCountReconciliationReport = (auditResults) => {
  if (!Array.isArray(auditResults)) {
    throw new TypeError("auditResults must be an array");
  }
  if (auditResults.length !== MIGRATION_ENTITIES.length) {
    throw new TypeError(`Expected exactly ${MIGRATION_ENTITIES.length} migration entity counts`);
  }

  const expectedTypes = new Set(MIGRATION_ENTITIES.map(({ entityType }) => entityType));
  const seenTypes = new Set();
  const entries = auditResults.map((result, index) => {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new TypeError(`auditResults[${index}] must be an object`);
    }
    const { entityType, sourceCount, targetCount, matches } = result;
    if (typeof entityType !== "string" || !expectedTypes.has(entityType)) {
      throw new TypeError(`auditResults[${index}].entityType is not in the migration inventory`);
    }
    if (seenTypes.has(entityType)) {
      throw new TypeError(`Duplicate audit result for entityType: ${entityType}`);
    }
    seenTypes.add(entityType);
    for (const [label, value] of [["sourceCount", sourceCount], ["targetCount", targetCount]]) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`auditResults[${index}].${label} must be a non-negative safe integer`);
      }
    }
    if (typeof matches !== "boolean" || matches !== (sourceCount === targetCount)) {
      throw new TypeError(`auditResults[${index}].matches is inconsistent with its counts`);
    }
    return Object.freeze({ entityType, sourceCount, targetCount, difference: targetCount - sourceCount, matches });
  });

  for (const entityType of expectedTypes) {
    if (!seenTypes.has(entityType)) {
      throw new TypeError(`Missing audit result for entityType: ${entityType}`);
    }
  }

  const matched = entries.filter(({ matches }) => matches);
  const mismatched = entries.filter(({ matches }) => !matches);
  const sourceTotal = entries.reduce((sum, { sourceCount }) => sum + sourceCount, 0);
  const targetTotal = entries.reduce((sum, { targetCount }) => sum + targetCount, 0);
  if (!Number.isSafeInteger(sourceTotal) || !Number.isSafeInteger(targetTotal)) {
    throw new RangeError("Aggregate source and target totals must remain safe integers");
  }
  const totalDifference = targetTotal - sourceTotal;
  if (!Number.isSafeInteger(totalDifference)) {
    throw new RangeError("Aggregate count difference must remain a safe integer");
  }

  return Object.freeze({
    entityCount: entries.length,
    matchedEntityCount: matched.length,
    mismatchedEntityCount: mismatched.length,
    sourceTotal,
    targetTotal,
    totalDifference,
    allMatched: mismatched.length === 0,
    matched: Object.freeze(matched),
    mismatched: Object.freeze(mismatched)
  });
};
