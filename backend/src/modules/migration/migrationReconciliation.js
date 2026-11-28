import { validateLegacyMappingBatch } from "./legacyIdMapping.js";

const isCount = (value) => Number.isSafeInteger(value) && value >= 0;

/**
 * Reconciles source/target entity totals and verified mapping coverage.
 * Inputs are already extracted audit summaries; this function performs no IO
 * and cannot mutate MongoDB or Supabase.
 */
export const reconcileMigrationBatch = ({
  sourceCounts,
  targetCounts,
  mappingRecords
} = {}) => {
  const errors = [];
  if (!sourceCounts || typeof sourceCounts !== "object" || Array.isArray(sourceCounts)) {
    throw new TypeError("sourceCounts must be an entity-count object");
  }
  if (!targetCounts || typeof targetCounts !== "object" || Array.isArray(targetCounts)) {
    throw new TypeError("targetCounts must be an entity-count object");
  }
  if (!Array.isArray(mappingRecords)) {
    throw new TypeError("mappingRecords must be an array");
  }

  const mappingValidation = validateLegacyMappingBatch(mappingRecords);
  errors.push(...mappingValidation.errors.map((error) => `mapping: ${error}`));

  const entityTypes = [...new Set([
    ...Object.keys(sourceCounts),
    ...Object.keys(targetCounts),
    ...mappingRecords.map((record) => record?.entity_type).filter((value) => typeof value === "string")
  ])].sort();

  const entities = entityTypes.map((entityType) => {
    const sourceCount = sourceCounts[entityType] ?? 0;
    const targetCount = targetCounts[entityType] ?? 0;
    const verifiedMappingCount = mappingRecords.filter((record) =>
      record?.entity_type === entityType && record?.mapping_status === "verified"
    ).length;

    if (!isCount(sourceCount)) errors.push(`${entityType}: source count must be a non-negative safe integer`);
    if (!isCount(targetCount)) errors.push(`${entityType}: target count must be a non-negative safe integer`);
    if (isCount(sourceCount) && isCount(targetCount) && sourceCount !== targetCount) {
      errors.push(`${entityType}: source/target row counts differ (${sourceCount} vs ${targetCount})`);
    }
    if (isCount(sourceCount) && sourceCount !== verifiedMappingCount) {
      errors.push(`${entityType}: verified mapping count differs from source count (${verifiedMappingCount} vs ${sourceCount})`);
    }

    return { entityType, sourceCount, targetCount, verifiedMappingCount };
  });

  return {
    valid: errors.length === 0,
    entities,
    errors
  };
};
