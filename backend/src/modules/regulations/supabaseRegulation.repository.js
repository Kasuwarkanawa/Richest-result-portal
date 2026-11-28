const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
};

const assertUuid = (id, field = "regulation ID") => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);
  }
};

const normalizeYear = (value, field, { nullable = false } = {}) => {
  if (nullable && (value === null || value === undefined)) return null;
  if (!Number.isInteger(value) || value < 1900 || value > 3000) {
    throw new TypeError(`${field} must be an integer between 1900 and 3000`);
  }
  return value;
};

const validateRange = (fromYear, toYear) => {
  if (toYear !== null && fromYear > toYear) {
    throw new TypeError("Effective from batch year cannot be greater than effective to batch year");
  }
};

const normalizeBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
};

const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};

const mapRegulation = (row) => ({
  _id: row.id,
  id: row.id,
  code: row.code,
  name: row.name,
  effectiveFromBatchYear: row.effective_from_batch_year,
  effectiveToBatchYear: row.effective_to_batch_year ?? null,
  isActive: row.is_active,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});

const selectColumns = "id,code,name,effective_from_batch_year,effective_to_batch_year,is_active,created_at,updated_at";

/**
 * Isolated regulations repository. Inject the server-only PostgREST request
 * helper. This adapter is not connected to live Mongo-backed routes.
 */
export const createSupabaseRegulationRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");

  const findOne = async (query, operation) => {
    const rows = expectRows(await request("regulations", { query }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned more than one regulation`);
    return rows.length ? mapRegulation(rows[0]) : null;
  };

  return Object.freeze({
    listRegulations: async () => {
      const query = new URLSearchParams({ select: selectColumns, order: "created_at.desc" }).toString();
      return expectRows(await request("regulations", { query }), "regulation list").map(mapRegulation);
    },

    findRegulationById: async (id) => {
      assertUuid(id);
      const query = new URLSearchParams({ select: selectColumns, id: `eq.${id}`, limit: "2" }).toString();
      return findOne(query, "regulation ID lookup");
    },

    findRegulationByCode: async (code) => {
      const normalizedCode = requireText(code, "Regulation code").toUpperCase();
      const query = new URLSearchParams({ select: selectColumns, code: `eq.${normalizedCode}`, limit: "2" }).toString();
      return findOne(query, "regulation code lookup");
    },

    createRegulation: async (payload = {}) => {
      const fromYear = normalizeYear(payload.effectiveFromBatchYear, "Effective from batch year");
      const toYear = normalizeYear(payload.effectiveToBatchYear, "Effective to batch year", { nullable: true });
      validateRange(fromYear, toYear);
      const body = {
        code: requireText(payload.code, "Regulation code").toUpperCase(),
        name: requireText(payload.name, "Regulation name"),
        effective_from_batch_year: fromYear,
        effective_to_batch_year: toYear,
        is_active: payload.isActive === undefined ? true : normalizeBoolean(payload.isActive, "Active status")
      };
      const rows = expectRows(await request("regulations", {
        method: "POST",
        query: `select=${selectColumns}`,
        body,
        prefer: "return=representation"
      }), "regulation create");
      if (rows.length !== 1) throw new Error("Supabase regulation create did not return exactly one regulation");
      return mapRegulation(rows[0]);
    },

    updateRegulation: async (id, payload = {}) => {
      assertUuid(id);
      const body = {};
      if (payload.code !== undefined) body.code = requireText(payload.code, "Regulation code").toUpperCase();
      if (payload.name !== undefined) body.name = requireText(payload.name, "Regulation name");
      if (payload.effectiveFromBatchYear !== undefined) {
        body.effective_from_batch_year = normalizeYear(payload.effectiveFromBatchYear, "Effective from batch year");
      }
      if (payload.effectiveToBatchYear !== undefined) {
        body.effective_to_batch_year = normalizeYear(payload.effectiveToBatchYear, "Effective to batch year", { nullable: true });
      }
      if (payload.isActive !== undefined) body.is_active = normalizeBoolean(payload.isActive, "Active status");
      if (!Object.keys(body).length) throw new TypeError("At least one regulation field must be supplied");

      // Validate the complete range, including the unchanged value, before writing.
      const current = (body.effective_from_batch_year === undefined || body.effective_to_batch_year === undefined)
        ? await findOne(new URLSearchParams({
            select: "id,effective_from_batch_year,effective_to_batch_year",
            id: `eq.${id}`,
            limit: "2"
          }).toString(), "regulation range lookup")
        : null;
      if (!current && (body.effective_from_batch_year === undefined || body.effective_to_batch_year === undefined)) {
        // A missing row is left to the update response; no write is attempted with an unverifiable range.
        if (!current) return null;
      }
      const fromYear = body.effective_from_batch_year ?? current.effectiveFromBatchYear;
      const toYear = body.effective_to_batch_year === undefined
        ? current.effectiveToBatchYear
        : body.effective_to_batch_year;
      validateRange(fromYear, toYear);

      const rows = expectRows(await request("regulations", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body,
        prefer: "return=representation"
      }), "regulation update");
      if (rows.length > 1) throw new Error("Supabase regulation update matched multiple rows");
      return rows.length ? mapRegulation(rows[0]) : null;
    }
  });
};
