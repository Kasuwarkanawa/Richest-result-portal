const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEPARTMENT_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} is required`);
  }
  return value.trim();
};

const assertUuid = (id) => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new TypeError("A valid PostgreSQL UUID is required for department ID");
  }
};

const normalizeStatus = (status = "ACTIVE") => {
  if (typeof status !== "string" || !DEPARTMENT_STATUSES.has(status.trim().toUpperCase())) {
    throw new TypeError("Department status must be ACTIVE or INACTIVE");
  }
  return status.trim().toUpperCase();
};

const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) {
    throw new TypeError(`Supabase ${operation} returned an invalid response`);
  }
  return rows;
};

const mapDepartment = (row) => ({
  _id: row.id,
  id: row.id,
  code: row.code,
  name: row.name,
  shortName: row.short_name || "",
  status: row.status,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});

const selectColumns = "id,code,name,short_name,status,created_at,updated_at";

/**
 * Isolated department repository. The caller must inject the server-only
 * PostgREST request helper. This adapter is not wired into live Mongo routes.
 */
export const createSupabaseDepartmentRepository = ({ request } = {}) => {
  if (typeof request !== "function") {
    throw new TypeError("A server-side Supabase request function is required");
  }

  const findOne = async (query, operation) => {
    const rows = expectRows(await request("departments", { query }), operation);
    if (rows.length > 1) {
      throw new Error(`Supabase ${operation} returned more than one department`);
    }
    return rows.length ? mapDepartment(rows[0]) : null;
  };

  return Object.freeze({
    listDepartments: async () => {
      const query = new URLSearchParams({
        select: selectColumns,
        order: "created_at.desc"
      }).toString();
      return expectRows(await request("departments", { query }), "department list")
        .map(mapDepartment);
    },

    findDepartmentById: async (id) => {
      assertUuid(id);
      const query = new URLSearchParams({
        select: selectColumns,
        id: `eq.${id}`,
        limit: "2"
      }).toString();
      return findOne(query, "department ID lookup");
    },

    findDepartmentByCode: async (code) => {
      const normalizedCode = requireText(code, "Department code").toUpperCase();
      const query = new URLSearchParams({
        select: selectColumns,
        code: `eq.${normalizedCode}`,
        limit: "2"
      }).toString();
      return findOne(query, "department code lookup");
    },

    createDepartment: async (payload = {}) => {
      const body = {
        code: requireText(payload.code, "Department code").toUpperCase(),
        name: requireText(payload.name, "Department name"),
        short_name: typeof payload.shortName === "string" ? payload.shortName.trim() : "",
        status: normalizeStatus(payload.status)
      };
      const rows = expectRows(
        await request("departments", {
          method: "POST",
          query: `select=${selectColumns}`,
          body,
          prefer: "return=representation"
        }),
        "department create"
      );
      if (rows.length !== 1) {
        throw new Error("Supabase department create did not return exactly one department");
      }
      return mapDepartment(rows[0]);
    },

    updateDepartment: async (id, payload = {}) => {
      assertUuid(id);
      const body = {};
      if (payload.code !== undefined) body.code = requireText(payload.code, "Department code").toUpperCase();
      if (payload.name !== undefined) body.name = requireText(payload.name, "Department name");
      if (payload.shortName !== undefined) {
        if (typeof payload.shortName !== "string") throw new TypeError("Department short name must be text");
        body.short_name = payload.shortName.trim();
      }
      if (payload.status !== undefined) body.status = normalizeStatus(payload.status);
      if (!Object.keys(body).length) throw new TypeError("At least one department field must be supplied");

      const rows = expectRows(
        await request("departments", {
          method: "PATCH",
          query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
          body,
          prefer: "return=representation"
        }),
        "department update"
      );
      if (rows.length > 1) throw new Error("Supabase department update matched multiple rows");
      return rows.length ? mapDepartment(rows[0]) : null;
    }
  });
};
