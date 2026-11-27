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
 * Generates an RFC 4122 UUIDv5 candidate. Persist and reuse it through the
 * reviewed migration ledger; do not independently regenerate IDs per import.
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
  const name = Buffer.from(`${source}/${entity}/${id}`, "utf8");
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
