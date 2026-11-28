import { createHash } from "node:crypto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

const requireText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`A non-empty ${label} is required`);
  }
  return value.trim();
};

export const normalizeLegacyObjectId = (legacyId) => {
  if (typeof legacyId !== "string" || !OBJECT_ID_PATTERN.test(legacyId)) {
    throw new TypeError("A 24-character MongoDB ObjectId is required");
  }
  return legacyId.toLowerCase();
};

const uuidToBytes = (uuid) => {
  if (typeof uuid !== "string" || !UUID_PATTERN.test(uuid)) {
    throw new TypeError("A valid UUID namespace is required");
  }
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
};

const bytesToUuid = (bytes) => {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * Generates an RFC 4122 UUIDv5 candidate. The name is a JSON-encoded
 * three-element tuple, avoiding delimiter ambiguity between identity fields.
 * Persist and reuse the candidate through the reviewed migration ledger.
 */
export const createDeterministicTargetUuid = ({
  namespaceUuid,
  sourceSystem,
  entityType,
  legacyId
} = {}) => {
  const namespace = uuidToBytes(namespaceUuid);
  const source = requireText(sourceSystem, "source system");
  const entity = requireText(entityType, "entity type");
  const id = normalizeLegacyObjectId(legacyId);
  const name = Buffer.from(JSON.stringify([source, entity, id]), "utf8");
  const digest = createHash("sha1").update(namespace).update(name).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytesToUuid(bytes);
};

/**
 * Resolves only a unique, explicitly verified ledger entry. It never casts
 * an ObjectId or invents a UUID when a mapping is absent or unverified.
 */
export const resolveVerifiedLegacyId = ({
  records,
  sourceSystem,
  entityType,
  legacyId
} = {}) => {
  if (!Array.isArray(records)) {
    throw new TypeError("Mapping ledger records must be an array");
  }
  const source = requireText(sourceSystem, "source system");
  const entity = requireText(entityType, "entity type");
  const id = normalizeLegacyObjectId(legacyId);
  const matches = records.filter((record) =>
    record?.source_system === source &&
    record?.entity_type === entity &&
    typeof record?.legacy_id === "string" &&
    record.legacy_id.toLowerCase() === id
  );

  if (matches.length > 1) {
    throw new Error("Mapping ledger contains duplicate entries for this legacy ID");
  }
  if (matches.length === 0) {
    throw new Error("No mapping ledger entry exists for this legacy ID");
  }
  const [mapping] = matches;
  if (mapping.mapping_status !== "verified") {
    throw new Error("Legacy ID mapping is not verified");
  }
  if (typeof mapping.target_id !== "string" || !UUID_PATTERN.test(mapping.target_id)) {
    throw new Error("Verified mapping has an invalid target UUID");
  }
  return mapping.target_id.toLowerCase();
};


const ALLOWED_MAPPING_STATUSES = new Set(["pending", "imported", "verified", "rejected"]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Performs a fail-closed, in-memory validation of a proposed mapping batch.
 * This is a preflight guard, not a replacement for database constraints or
 * source/target reconciliation. It never mutates records.
 */
export const validateLegacyMappingBatch = (records) => {
  if (!Array.isArray(records)) {
    throw new TypeError("Mapping batch records must be an array");
  }

  const errors = [];
  const sourceKeys = new Set();
  const targetKeys = new Set();

  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label} must be an object`);
      return;
    }

    const source = typeof record.source_system === "string" ? record.source_system.trim() : "";
    const entity = typeof record.entity_type === "string" ? record.entity_type.trim() : "";
    let legacyId;
    try {
      legacyId = normalizeLegacyObjectId(record.legacy_id);
    } catch {
      errors.push(`${label}.legacy_id must be a valid MongoDB ObjectId`);
    }

    if (!source) errors.push(`${label}.source_system is required`);
    if (!entity) errors.push(`${label}.entity_type is required`);
    if (!ALLOWED_MAPPING_STATUSES.has(record.mapping_status)) {
      errors.push(`${label}.mapping_status is invalid`);
    }

    if (source && entity && legacyId) {
      const sourceKey = JSON.stringify([source, entity, legacyId]);
      if (sourceKeys.has(sourceKey)) errors.push(`${label} duplicates a source identity`);
      sourceKeys.add(sourceKey);
    }

    const hasTarget = typeof record.target_id === "string" && UUID_PATTERN.test(record.target_id);
    if (record.mapping_status === "pending" && record.target_id != null) {
      errors.push(`${label} pending mapping must not have a target_id`);
    }
    if (["imported", "verified"].includes(record.mapping_status) && !hasTarget) {
      errors.push(`${label} imported or verified mapping requires a valid target UUID`);
    }
    if (record.target_id != null && !hasTarget) {
      errors.push(`${label}.target_id must be a valid UUID`);
    }
    if (hasTarget && entity) {
      const targetKey = JSON.stringify([entity, record.target_id.toLowerCase()]);
      if (targetKeys.has(targetKey)) errors.push(`${label} duplicates a target UUID within the entity type`);
      targetKeys.add(targetKey);
    }

    if (record.mapping_status === "verified") {
      if (typeof record.verified_at !== "string" || !record.verified_at.trim() ||
          Number.isNaN(Date.parse(record.verified_at))) {
        errors.push(`${label} verified mapping requires a valid verified_at timestamp`);
      }
      if (typeof record.source_checksum !== "string" || !SHA256_PATTERN.test(record.source_checksum)) {
        errors.push(`${label} verified mapping requires a lowercase SHA-256 source_checksum`);
      }
      if (typeof record.target_checksum !== "string" || !SHA256_PATTERN.test(record.target_checksum)) {
        errors.push(`${label} verified mapping requires a lowercase SHA-256 target_checksum`);
      }
    } else if (record.verified_at != null) {
      errors.push(`${label} verified_at is only allowed for verified mappings`);
    }
  });

  return { valid: errors.length === 0, errors };
};
