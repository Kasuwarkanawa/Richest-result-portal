/**
 * Read-only migration inventory.
 *
 * This manifest defines dependency order and sensitive-field handling only.
 * It does not connect to MongoDB/Supabase, read credentials, or write data.
 * Resolve each physical Mongo collection from the registered Mongoose model
 * at runtime (model.collection.name); do not infer it by string pluralization.
 */
export const MIGRATION_INVENTORY_VERSION = 1;

export const MIGRATION_ENTITIES = Object.freeze([
  { entityType: "departments", sourceModel: "Department", targetTable: "departments", dependsOn: [], sensitiveFields: [] },
  { entityType: "regulations", sourceModel: "Regulation", targetTable: "regulations", dependsOn: [], sensitiveFields: [] },
  { entityType: "batches", sourceModel: "Batch", targetTable: "batches", dependsOn: [], sensitiveFields: [] },
  { entityType: "semesters", sourceModel: "Semester", targetTable: "semesters", dependsOn: [], sensitiveFields: [] },
  { entityType: "subjects", sourceModel: "Subject", targetTable: "subjects", dependsOn: [], sensitiveFields: [] },
  { entityType: "users", sourceModel: "User", targetTable: "users", dependsOn: [], sensitiveFields: ["passwordHash"] },
  { entityType: "user_departments", sourceModel: "User.departmentIds", targetTable: "user_departments", dependsOn: ["users", "departments"], sensitiveFields: [] },
  { entityType: "programs", sourceModel: "Program", targetTable: "programs", dependsOn: ["departments"], sensitiveFields: [] },
  { entityType: "grading_policies", sourceModel: "GradingPolicy", targetTable: "grading_policies", dependsOn: [], sensitiveFields: [] },
  { entityType: "curriculum_mappings", sourceModel: "CurriculumMapping", targetTable: "curriculum_mappings", dependsOn: ["batches", "programs", "regulations", "semesters", "subjects"], sensitiveFields: [] },
  { entityType: "students", sourceModel: "Student", targetTable: "students", dependsOn: ["departments", "programs", "regulations", "batches", "semesters"], sensitiveFields: ["studentPinHash"] },
  { entityType: "exam_sessions", sourceModel: "ExamSession", targetTable: "exam_sessions", dependsOn: ["regulations", "batches", "users"], sensitiveFields: [] },
  { entityType: "exam_registrations", sourceModel: "ExamRegistration", targetTable: "exam_registrations", dependsOn: ["exam_sessions", "students", "subjects", "semesters"], sensitiveFields: [] },
  { entityType: "mark_entries", sourceModel: "MarkEntry", targetTable: "mark_entries", dependsOn: ["exam_registrations", "exam_sessions", "students", "subjects", "users"], sensitiveFields: [] },
  { entityType: "processed_results", sourceModel: "ProcessedResult", targetTable: "processed_results", dependsOn: ["exam_sessions", "exam_registrations", "students", "subjects", "semesters", "grading_policies"], sensitiveFields: [] },
  { entityType: "semester_summaries", sourceModel: "SemesterSummary", targetTable: "semester_summaries", dependsOn: ["students", "exam_sessions", "semesters"], sensitiveFields: [] },
  { entityType: "publish_snapshots", sourceModel: "PublishSnapshot", targetTable: "publish_snapshots", dependsOn: ["exam_sessions", "users"], sensitiveFields: [] },
  { entityType: "published_result_snapshot_records", sourceModel: "PublishedResultSnapshotRecord", targetTable: "published_result_snapshot_records", dependsOn: ["publish_snapshots", "exam_sessions", "students"], sensitiveFields: [] }
]);

export const validateMigrationInventory = (entities = MIGRATION_ENTITIES) => {
  if (!Array.isArray(entities)) throw new TypeError("Migration inventory must be an array");
  const errors = [];
  const seenTypes = new Set();
  const seenTables = new Set();
  const seenModels = new Set();

  entities.forEach((entity, index) => {
    const label = `entities[${index}]`;
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
      errors.push(`${label} must be an object`);
      return;
    }
    for (const field of ["entityType", "sourceModel", "targetTable"]) {
      if (typeof entity[field] !== "string" || !entity[field].trim()) errors.push(`${label}.${field} is required`);
    }
    if (typeof entity.entityType === "string") {
      if (seenTypes.has(entity.entityType)) errors.push(`${label} duplicates entityType`);
      seenTypes.add(entity.entityType);
    }
    if (typeof entity.targetTable === "string") {
      if (seenTables.has(entity.targetTable)) errors.push(`${label} duplicates targetTable`);
      seenTables.add(entity.targetTable);
    }
    if (typeof entity.sourceModel === "string" && entity.entityType !== "user_departments") {
      if (seenModels.has(entity.sourceModel)) errors.push(`${label} duplicates sourceModel`);
      seenModels.add(entity.sourceModel);
    }
    if (!Array.isArray(entity.dependsOn)) errors.push(`${label}.dependsOn must be an array`);
    else {
      for (const dependency of entity.dependsOn) {
        if (!seenTypes.has(dependency)) errors.push(`${label} dependency '${dependency}' must appear earlier in the inventory`);
      }
    }
    if (!Array.isArray(entity.sensitiveFields) ||
        entity.sensitiveFields.some((field) => typeof field !== "string" || !field.trim())) {
      errors.push(`${label}.sensitiveFields must be an array of non-empty strings`);
    }
  });

  return { ok: errors.length === 0, errors, entityCount: entities.length };
};
