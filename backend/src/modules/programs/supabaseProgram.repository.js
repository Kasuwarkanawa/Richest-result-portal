const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEGREE_TYPES = new Set(["BE", "BTECH", "ME", "MTECH", "MBA", "MCA"]);
const PROGRAM_STATUSES = new Set(["ACTIVE", "INACTIVE"]);

const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
};

const assertUuid = (id, field = "program ID") => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);
  }
};

const normalizeDegreeType = (value) => {
  const degreeType = requireText(value, "Degree type").toUpperCase();
  if (!DEGREE_TYPES.has(degreeType)) {
    throw new TypeError("Degree type must be BE, BTECH, ME, MTECH, MBA, or MCA");
  }
  return degreeType;
};

const normalizeStatus = (value = "ACTIVE") => {
  if (typeof value !== "string" || !PROGRAM_STATUSES.has(value.trim().toUpperCase())) {
    throw new TypeError("Program status must be ACTIVE or INACTIVE");
  }
  return value.trim().toUpperCase();
};

const normalizeDuration = (value = 8) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError("Duration in semesters must be a positive integer");
  }
  return value;
};

const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};

const mapProgram = (row) => ({
  _id: row.id,
  id: row.id,
  code: row.code,
  name: row.name,
  shortName: row.short_name,
  degreeType: row.degree_type,
  durationInSemesters: row.duration_in_semesters,
  departmentId: row.department_id,
  status: row.status,
  createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});

const selectColumns = "id,code,name,short_name,degree_type,duration_in_semesters,department_id,status,created_at,updated_at";

/**
 * Isolated programs repository. Inject the server-only PostgREST request
 * helper. This adapter is deliberately not connected to live Mongo routes.
 */
export const createSupabaseProgramRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");

  const findOne = async (query, operation) => {
    const rows = expectRows(await request("programs", { query }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned more than one program`);
    return rows.length ? mapProgram(rows[0]) : null;
  };

  return Object.freeze({
    listPrograms: async () => {
      const query = new URLSearchParams({ select: selectColumns, order: "created_at.desc" }).toString();
      return expectRows(await request("programs", { query }), "program list").map(mapProgram);
    },

    findProgramById: async (id) => {
      assertUuid(id);
      const query = new URLSearchParams({ select: selectColumns, id: `eq.${id}`, limit: "2" }).toString();
      return findOne(query, "program ID lookup");
    },

    findProgramByCode: async (code) => {
      const normalizedCode = requireText(code, "Program code").toUpperCase();
      const query = new URLSearchParams({ select: selectColumns, code: `eq.${normalizedCode}`, limit: "2" }).toString();
      return findOne(query, "program code lookup");
    },

    createProgram: async (payload = {}) => {
      assertUuid(payload.departmentId, "department ID");
      const body = {
        code: requireText(payload.code, "Program code").toUpperCase(),
        name: requireText(payload.name, "Program name"),
        short_name: requireText(payload.shortName, "Program short name"),
        degree_type: normalizeDegreeType(payload.degreeType),
        duration_in_semesters: normalizeDuration(payload.durationInSemesters),
        department_id: payload.departmentId,
        status: normalizeStatus(payload.status)
      };
      const rows = expectRows(await request("programs", {
        method: "POST",
        query: `select=${selectColumns}`,
        body,
        prefer: "return=representation"
      }), "program create");
      if (rows.length !== 1) throw new Error("Supabase program create did not return exactly one program");
      return mapProgram(rows[0]);
    },

    updateProgram: async (id, payload = {}) => {
      assertUuid(id);
      const body = {};
      if (payload.code !== undefined) body.code = requireText(payload.code, "Program code").toUpperCase();
      if (payload.name !== undefined) body.name = requireText(payload.name, "Program name");
      if (payload.shortName !== undefined) body.short_name = requireText(payload.shortName, "Program short name");
      if (payload.degreeType !== undefined) body.degree_type = normalizeDegreeType(payload.degreeType);
      if (payload.durationInSemesters !== undefined) body.duration_in_semesters = normalizeDuration(payload.durationInSemesters);
      if (payload.departmentId !== undefined) {
        assertUuid(payload.departmentId, "department ID");
        body.department_id = payload.departmentId;
      }
      if (payload.status !== undefined) body.status = normalizeStatus(payload.status);
      if (!Object.keys(body).length) throw new TypeError("At least one program field must be supplied");

      const rows = expectRows(await request("programs", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body,
        prefer: "return=representation"
      }), "program update");
      if (rows.length > 1) throw new Error("Supabase program update matched multiple rows");
      return rows.length ? mapProgram(rows[0]) : null;
    }
  });
};
