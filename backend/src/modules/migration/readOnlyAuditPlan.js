import { MIGRATION_ENTITIES, validateMigrationInventory } from "./migrationInventory.js";

const ENTITY_BY_TYPE = new Map(MIGRATION_ENTITIES.map((entity) => [entity.entityType, entity]));
const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 5000;

/**
 * Creates a deterministic, read-only count audit plan for one manifest entity.
 * The plan contains identifiers and query bounds only; it never reads records,
 * includes sensitive columns, resolves credentials, or performs database IO.
 */
export const createReadOnlyAuditPlan = ({
  entityType,
  pageSize = DEFAULT_PAGE_SIZE,
  offset = 0
} = {}) => {
  const inventory = validateMigrationInventory();
  if (!inventory.ok) throw new Error(`Migration inventory is invalid: ${inventory.errors.join("; ")}`);
  if (typeof entityType !== "string" || !ENTITY_BY_TYPE.has(entityType)) {
    throw new TypeError("entityType must exist in the migration inventory");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(`pageSize must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError("offset must be a non-negative safe integer");
  }

  const entity = ENTITY_BY_TYPE.get(entityType);
  return Object.freeze({
    mode: "read-only-count-audit",
    entityType: entity.entityType,
    sourceModel: entity.sourceModel,
    targetTable: entity.targetTable,
    dependsOn: [...entity.dependsOn],
    pageSize,
    offset,
    source: Object.freeze({
      operation: "countDocuments",
      model: entity.sourceModel,
      collectionName: "resolve-from-registered-model-at-runtime"
    }),
    target: Object.freeze({
      operation: "count",
      table: entity.targetTable,
      schema: "public"
    }),
    prohibited: Object.freeze([
      "insert", "update", "upsert", "delete", "truncate", "ddl",
      "credential-access", "record-payload-export"
    ])
  });
};

export const createReadOnlyAuditPlanForAll = (options = {}) =>
  MIGRATION_ENTITIES.map(({ entityType }) => createReadOnlyAuditPlan({ ...options, entityType }));
