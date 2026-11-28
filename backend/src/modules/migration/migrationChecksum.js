import { createHash } from "node:crypto";

/**
 * Produces deterministic JSON for migration audit checksums.
 * Object keys are sorted; array order is preserved; unsupported values fail
 * closed so a checksum is never silently computed from lossy JSON output.
 */
export const canonicalizeForChecksum = (value) => {
  const visit = (item, path) => {
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError(`${path} contains a non-finite number`);
      return Object.is(item, -0) ? 0 : item;
    }
    if (item instanceof Date) {
      if (Number.isNaN(item.getTime())) throw new TypeError(`${path} contains an invalid Date`);
      return item.toISOString();
    }
    if (Array.isArray(item)) {
      return item.map((entry, index) => {
        if (entry === undefined) throw new TypeError(`${path}[${index}] is undefined`);
        return visit(entry, `${path}[${index}]`);
      });
    }
    if (typeof item === "object") {
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} contains an unsupported object type`);
      }
      const result = {};
      for (const key of Object.keys(item).sort()) {
        if (item[key] === undefined) throw new TypeError(`${path}.${key} is undefined`);
        result[key] = visit(item[key], `${path}.${key}`);
      }
      return result;
    }
    throw new TypeError(`${path} contains an unsupported value`);
  };

  return JSON.stringify(visit(value, "value"));
};

export const createMigrationChecksum = (value) =>
  createHash("sha256").update(canonicalizeForChecksum(value), "utf8").digest("hex");
