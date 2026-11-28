import { MIGRATION_ENTITIES, validateMigrationInventory } from "./migrationInventory.js";

const TARGET_TABLES = new Set(MIGRATION_ENTITIES.map(({ targetTable }) => targetTable));

/**
 * Parse the total from a PostgREST Content-Range header.
 * Accepts both "0-0/12" and "*/0"; rejects missing or inexact totals.
 */
export const parsePostgrestExactCount = (contentRange) => {
  if (typeof contentRange !== "string") {
    throw new TypeError("PostgREST response is missing Content-Range metadata");
  }
  const match = contentRange.trim().match(/^(?:\d+-\d+|\*)\/(\d+|\*)$/);
  if (!match || match[1] === "*") {
    throw new TypeError("PostgREST did not return an exact total count");
  }
  const count = Number(match[1]);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new TypeError("PostgREST exact count must be a non-negative safe integer");
  }
  return count;
};

/**
 * Creates a count-only Supabase adapter.
 * The injected request must support includeResponseMetadata and must be a
 * server-side PostgREST request function. Only inventory tables are accepted.
 */
export const createSupabaseCountFunction = ({ request } = {}) => {
  const inventory = validateMigrationInventory();
  if (!inventory.ok) throw new Error(`Migration inventory is invalid: ${inventory.errors.join("; ")}`);
  if (typeof request !== "function") throw new TypeError("request must be an injected Supabase request function");

  return async (table) => {
    if (typeof table !== "string" || !TARGET_TABLES.has(table)) {
      throw new TypeError("table must be an allowlisted migration target table");
    }
    const response = await request(table, {
      method: "GET",
      query: "select=id&limit=0",
      prefer: "count=exact",
      includeResponseMetadata: true
    });
    if (!response || !Object.prototype.hasOwnProperty.call(response, "data")) {
      throw new TypeError("Supabase request did not return response metadata");
    }
    if (!Array.isArray(response.data)) {
      throw new TypeError("Count-only Supabase request must return an array payload");
    }
    return parsePostgrestExactCount(response.contentRange);
  };
};
