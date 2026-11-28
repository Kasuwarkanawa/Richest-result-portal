import { MIGRATION_ENTITIES, validateMigrationInventory } from "./migrationInventory.js";

const ENTITY_BY_TYPE = new Map(MIGRATION_ENTITIES.map((entity) => [entity.entityType, entity]));

/**
 * Creates injected, count-only adapters. No connection is opened here.
 * Mongo models and the Supabase count function are supplied by the caller.
 * The adapter exposes no record reads or write methods.
 */
export const createReadOnlyAuditAdapters = ({ models, countTargetRows } = {}) => {
  const inventory = validateMigrationInventory();
  if (!inventory.ok) throw new Error(`Migration inventory is invalid: ${inventory.errors.join("; ")}`);
  if (!models || typeof models !== "object") throw new TypeError("models must be an injected model registry");
  if (typeof countTargetRows !== "function") throw new TypeError("countTargetRows must be an injected read-only function");

  const countSourceRows = async (entity) => {
    if (entity.entityType === "user_departments") {
      const User = models.User;
      if (!User || typeof User.aggregate !== "function") throw new TypeError("User model must support aggregate()");
      const rows = await User.aggregate([
        { $unwind: "$departmentIds" },
        { $count: "sourceCount" }
      ]).exec();
      return rows[0]?.sourceCount ?? 0;
    }

    const Model = models[entity.sourceModel];
    if (!Model || typeof Model.countDocuments !== "function") {
      throw new TypeError(`Missing count-capable Mongo model: ${entity.sourceModel}`);
    }
    const query = Model.countDocuments({});
    if (!query || typeof query.exec !== "function") throw new TypeError("Mongo countDocuments() must return an executable query");
    return query.exec();
  };

  const countEntity = async (entityType) => {
    const entity = ENTITY_BY_TYPE.get(entityType);
    if (!entity) throw new TypeError("entityType must exist in the migration inventory");

    const [sourceCount, targetCount] = await Promise.all([
      countSourceRows(entity),
      countTargetRows(entity.targetTable)
    ]);

    for (const [label, value] of [["sourceCount", sourceCount], ["targetCount", targetCount]]) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative safe integer`);
      }
    }

    return Object.freeze({
      entityType: entity.entityType,
      sourceCount,
      targetCount,
      matches: sourceCount === targetCount
    });
  };

  return Object.freeze({
    countEntity,
    countAll: async () => Promise.all(MIGRATION_ENTITIES.map(({ entityType }) => countEntity(entityType)))
  });
};
