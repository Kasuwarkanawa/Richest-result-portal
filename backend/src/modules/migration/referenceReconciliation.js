import { normalizeLegacyObjectId, validateLegacyMappingBatch } from "./legacyIdMapping.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
};

/**
 * Checks source foreign-key references against verified legacy mappings and
 * the independently extracted set of target UUIDs. Pure preflight only.
 *
 * references: { owner_entity_type, owner_legacy_id, field,
 *               referenced_entity_type, referenced_legacy_id }
 * targetIdsByEntity: { [entityType]: string[] }
 */
export const reconcileMigrationReferences = ({
  sourceSystem,
  mappingRecords,
  references,
  targetIdsByEntity
} = {}) => {
  const source = requireText(sourceSystem, "sourceSystem");
  if (!Array.isArray(mappingRecords)) throw new TypeError("mappingRecords must be an array");
  if (!Array.isArray(references)) throw new TypeError("references must be an array");
  if (!targetIdsByEntity || typeof targetIdsByEntity !== "object" || Array.isArray(targetIdsByEntity)) {
    throw new TypeError("targetIdsByEntity must be an entity-to-UUID-array object");
  }

  const validation = validateLegacyMappingBatch(mappingRecords);
  const errors = validation.errors.map((error) => `mapping: ${error}`);
  const mappingIndex = new Map();

  for (const mapping of mappingRecords) {
    if (!mapping || typeof mapping !== "object") continue;
    if (mapping.source_system !== source || typeof mapping.entity_type !== "string" ||
        typeof mapping.legacy_id !== "string") continue;
    let legacyId;
    try { legacyId = normalizeLegacyObjectId(mapping.legacy_id); } catch { continue; }
    const key = JSON.stringify([mapping.entity_type, legacyId]);
    if (!mappingIndex.has(key)) mappingIndex.set(key, []);
    mappingIndex.get(key).push(mapping);
  }

  const targetSets = new Map();
  for (const [entityType, ids] of Object.entries(targetIdsByEntity)) {
    if (!Array.isArray(ids)) {
      errors.push(`targetIdsByEntity.${entityType} must be an array`);
      continue;
    }
    const set = new Set();
    for (const id of ids) {
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
        errors.push(`targetIdsByEntity.${entityType} contains an invalid UUID`);
        continue;
      }
      const normalized = id.toLowerCase();
      if (set.has(normalized)) errors.push(`targetIdsByEntity.${entityType} contains duplicate UUIDs`);
      set.add(normalized);
    }
    targetSets.set(entityType, set);
  }

  const resolve = (entityType, legacyId, label) => {
    let normalized;
    try { normalized = normalizeLegacyObjectId(legacyId); }
    catch {
      errors.push(`${label} has an invalid legacy ObjectId`);
      return null;
    }
    const matches = mappingIndex.get(JSON.stringify([entityType, normalized])) || [];
    if (matches.length !== 1) {
      errors.push(`${label} does not resolve to exactly one mapping`);
      return null;
    }
    const [mapping] = matches;
    if (mapping.mapping_status !== "verified" || typeof mapping.target_id !== "string" ||
        !UUID_PATTERN.test(mapping.target_id)) {
      errors.push(`${label} mapping is not verified with a valid target UUID`);
      return null;
    }
    const targetSet = targetSets.get(entityType);
    if (!targetSet || !targetSet.has(mapping.target_id.toLowerCase())) {
      errors.push(`${label} target UUID is absent from target entity set`);
      return null;
    }
    return mapping.target_id.toLowerCase();
  };

  const reconciled = references.map((reference, index) => {
    const label = `references[${index}]`;
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) {
      errors.push(`${label} must be an object`);
      return { index, valid: false };
    }
    const ownerEntity = typeof reference.owner_entity_type === "string" ? reference.owner_entity_type.trim() : "";
    const field = typeof reference.field === "string" ? reference.field.trim() : "";
    const referencedEntity = typeof reference.referenced_entity_type === "string" ? reference.referenced_entity_type.trim() : "";
    if (!ownerEntity || !field || !referencedEntity) {
      errors.push(`${label} requires owner_entity_type, field, and referenced_entity_type`);
      return { index, valid: false };
    }
    const ownerTargetId = resolve(ownerEntity, reference.owner_legacy_id, `${label} owner`);
    const referencedTargetId = resolve(referencedEntity, reference.referenced_legacy_id, `${label} reference`);
    return {
      index,
      field,
      ownerEntityType: ownerEntity,
      ownerTargetId,
      referencedEntityType: referencedEntity,
      referencedTargetId,
      valid: Boolean(ownerTargetId && referencedTargetId)
    };
  });

  return { valid: errors.length === 0, references: reconciled, errors };
};
