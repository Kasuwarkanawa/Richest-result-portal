import { normalizeLegacyObjectId, validateLegacyMappingBatch } from "./legacyIdMapping.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Compares precomputed canonical row checksums without exposing row payloads.
 *
 * sourceRecords: [{ legacyId, checksum }]
 * targetRecords: [{ targetId, checksum }]
 *
 * The caller must canonicalize equivalent business fields on both sides and
 * exclude/rewrite legacy-vs-target identifiers consistently before hashing.
 * This helper performs no database IO and never returns source row contents.
 */
export const reconcileEntityChecksums = ({
  sourceSystem,
  entityType,
  sourceRecords,
  targetRecords,
  mappingRecords
} = {}) => {
  if (typeof sourceSystem !== "string" || !sourceSystem.trim()) {
    throw new TypeError("sourceSystem is required");
  }
  if (typeof entityType !== "string" || !entityType.trim()) {
    throw new TypeError("entityType is required");
  }
  if (!Array.isArray(sourceRecords)) throw new TypeError("sourceRecords must be an array");
  if (!Array.isArray(targetRecords)) throw new TypeError("targetRecords must be an array");
  if (!Array.isArray(mappingRecords)) throw new TypeError("mappingRecords must be an array");

  const errors = validateLegacyMappingBatch(mappingRecords).errors.map((error) => `mapping: ${error}`);
  const source = sourceSystem.trim();
  const entity = entityType.trim();
  const mappingByLegacyId = new Map();

  for (const record of mappingRecords) {
    if (record?.source_system !== source || record?.entity_type !== entity ||
        typeof record?.legacy_id !== "string") continue;
    let legacyId;
    try { legacyId = normalizeLegacyObjectId(record.legacy_id); } catch { continue; }
    if (!mappingByLegacyId.has(legacyId)) mappingByLegacyId.set(legacyId, []);
    mappingByLegacyId.get(legacyId).push(record);
  }

  const targetById = new Map();
  targetRecords.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`targetRecords[${index}] must be an object`);
      return;
    }
    if (typeof record.targetId !== "string" || !UUID_PATTERN.test(record.targetId)) {
      errors.push(`targetRecords[${index}].targetId must be a UUID`);
      return;
    }
    if (typeof record.checksum !== "string" || !CHECKSUM_PATTERN.test(record.checksum)) {
      errors.push(`targetRecords[${index}].checksum must be a lowercase SHA-256 checksum`);
      return;
    }
    const id = record.targetId.toLowerCase();
    if (targetById.has(id)) errors.push(`targetRecords[${index}] duplicates a target UUID`);
    else targetById.set(id, record.checksum);
  });

  const seenLegacyIds = new Set();
  const matchedTargetIds = new Set();
  let matchedCount = 0;
  let checksumMismatchCount = 0;

  sourceRecords.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`sourceRecords[${index}] must be an object`);
      return;
    }
    let legacyId;
    try { legacyId = normalizeLegacyObjectId(record.legacyId); }
    catch {
      errors.push(`sourceRecords[${index}].legacyId must be a valid ObjectId`);
      return;
    }
    if (seenLegacyIds.has(legacyId)) {
      errors.push(`sourceRecords[${index}] duplicates a source legacy ID`);
      return;
    }
    seenLegacyIds.add(legacyId);
    if (typeof record.checksum !== "string" || !CHECKSUM_PATTERN.test(record.checksum)) {
      errors.push(`sourceRecords[${index}].checksum must be a lowercase SHA-256 checksum`);
      return;
    }

    const mappings = mappingByLegacyId.get(legacyId) || [];
    if (mappings.length !== 1 || mappings[0].mapping_status !== "verified" ||
        typeof mappings[0].target_id !== "string" || !UUID_PATTERN.test(mappings[0].target_id)) {
      errors.push(`sourceRecords[${index}] does not have exactly one verified UUID mapping`);
      return;
    }
    const targetId = mappings[0].target_id.toLowerCase();
    if (!targetById.has(targetId)) {
      errors.push(`sourceRecords[${index}] mapped target row is missing`);
      return;
    }
    matchedTargetIds.add(targetId);
    matchedCount += 1;
    if (record.checksum !== targetById.get(targetId)) {
      checksumMismatchCount += 1;
      errors.push(`sourceRecords[${index}] canonical checksum differs from target`);
    }
  });

  const extraTargetCount = [...targetById.keys()].filter((id) => !matchedTargetIds.has(id)).length;
  if (extraTargetCount) errors.push(`${extraTargetCount} target rows have no source mapping`);

  return {
    valid: errors.length === 0,
    entityType: entity,
    sourceCount: sourceRecords.length,
    targetCount: targetRecords.length,
    matchedCount,
    checksumMismatchCount,
    extraTargetCount,
    errors
  };
};
