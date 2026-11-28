const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
};

const assertUuid = (id) => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new TypeError("A valid PostgreSQL UUID is required for batch ID");
  }
};

const normalizeYear = (value, field) => {
  if (!Number.isInteger(value) || value < 1900 || value > 3000) {
    throw new TypeError(`${field} must be an integer between 1900 and 3000`);
  }
  return value;
};

const validateYearRange = (startYear, endYear) => {
  if (startYear >= endYear) throw new TypeError("End year must be greater than start year");
};

const normalizeBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
};

const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};

const mapBatch = (row) => ({
  _id: row.id,
  id: row.id,
  label: row.label,
  startYear: row.start_year,
  endYear: row.end_year,
  isActive: row.is_active,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});

const selectColumns = "id,label,start_year,end_year,is_active,created_at,updated_at";

/** Isolated Supabase batch adapter; not connected to production Mongo routes. */
export const createSupabaseBatchRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");

  const findOne = async (query, operation) => {
    const rows = expectRows(await request("batches", { query }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned more than one batch`);
    return rows.length ? mapBatch(rows[0]) : null;
  };

  return Object.freeze({
    listBatches: async () => {
      const query = new URLSearchParams({ select: selectColumns, order: "created_at.desc" }).toString();
      return expectRows(await request("batches", { query }), "batch list").map(mapBatch);
    },

    findBatchById: async (id) => {
      assertUuid(id);
      const query = new URLSearchParams({ select: selectColumns, id: `eq.${id}`, limit: "2" }).toString();
      return findOne(query, "batch ID lookup");
    },

    findBatchByLabel: async (label) => {
      const normalizedLabel = requireText(label, "Batch label");
      const query = new URLSearchParams({ select: selectColumns, label: `eq.${normalizedLabel}`, limit: "2" }).toString();
      return findOne(query, "batch label lookup");
    },

    createBatch: async (payload = {}) => {
      const label = requireText(payload.label, "Batch label");
      const startYear = normalizeYear(payload.startYear, "Start year");
      const endYear = normalizeYear(payload.endYear, "End year");
      validateYearRange(startYear, endYear);
      const body = { label, start_year: startYear, end_year: endYear, is_active: true };
      const rows = expectRows(await request("batches", {
        method: "POST",
        query: `select=${selectColumns}`,
        body,
        prefer: "return=representation"
      }), "batch create");
      if (rows.length !== 1) throw new Error("Supabase batch create did not return exactly one batch");
      return mapBatch(rows[0]);
    },

    updateBatch: async (id, payload = {}) => {
      assertUuid(id);
      const body = {};
      if (payload.label !== undefined) body.label = requireText(payload.label, "Batch label");
      if (payload.startYear !== undefined) body.start_year = normalizeYear(payload.startYear, "Start year");
      if (payload.endYear !== undefined) body.end_year = normalizeYear(payload.endYear, "End year");
      if (payload.isActive !== undefined) body.is_active = normalizeBoolean(payload.isActive, "Active status");
      if (!Object.keys(body).length) throw new TypeError("At least one batch field must be supplied");

      if (body.start_year !== undefined || body.end_year !== undefined) {
        const current = await findOne(new URLSearchParams({
          select: "id,start_year,end_year",
          id: `eq.${id}`,
          limit: "2"
        }).toString(), "batch year lookup");
        if (!current) return null;
        validateYearRange(body.start_year ?? current.startYear, body.end_year ?? current.endYear);
      }

      const rows = expectRows(await request("batches", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body,
        prefer: "return=representation"
      }), "batch update");
      if (rows.length > 1) throw new Error("Supabase batch update matched multiple rows");
      return rows.length ? mapBatch(rows[0]) : null;
    },

    toggleBatchStatus: async (id) => {
      assertUuid(id);
      const current = await findOne(new URLSearchParams({
        select: "id,is_active",
        id: `eq.${id}`,
        limit: "2"
      }).toString(), "batch status lookup");
      if (!current) return null;
      const rows = expectRows(await request("batches", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body: { is_active: !current.isActive },
        prefer: "return=representation"
      }), "batch status update");
      if (rows.length > 1) throw new Error("Supabase batch status update matched multiple rows");
      return rows.length ? mapBatch(rows[0]) : null;
    }
  });
};
