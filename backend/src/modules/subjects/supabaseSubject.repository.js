const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBJECT_TYPES = new Set(["THEORY", "THEORY_CUM_LAB", "LABORATORY", "NON_CREDIT"]);

const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
};
const assertUuid = (id) => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) throw new TypeError("A valid PostgreSQL UUID is required for subject ID");
};
const normalizeNumber = (value, field, min, max) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${field} must be a number between ${min} and ${max}`);
  }
  return value;
};
const normalizeBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
};
const validateSubjectRules = (subject) => {
  if (!SUBJECT_TYPES.has(subject.subjectType)) throw new TypeError("Invalid subject type");
  if (subject.internalMax + subject.externalMax !== subject.totalMax) {
    throw new TypeError("Internal max + external max must equal total max");
  }
  if (subject.subjectType === "NON_CREDIT" && subject.credits !== 0) {
    throw new TypeError("Non-credit subject must have 0 credits");
  }
  if (!subject.hasInternal && subject.internalMax !== 0) {
    throw new TypeError("Internal max must be 0 when hasInternal is false");
  }
  if (!subject.hasExternal && subject.externalMax !== 0) {
    throw new TypeError("External max must be 0 when hasExternal is false");
  }
};
const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};
const mapSubject = (row) => ({
  _id: row.id, id: row.id, code: row.code, name: row.name, shortName: row.short_name,
  subjectType: row.subject_type, credits: Number(row.credits), internalMax: Number(row.internal_max),
  externalMax: Number(row.external_max), totalMax: Number(row.total_max),
  hasInternal: row.has_internal, hasExternal: row.has_external, isActive: row.is_active,
  createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null
});
const selectColumns = "id,code,name,short_name,subject_type,credits,internal_max,external_max,total_max,has_internal,has_external,is_active,created_at,updated_at";

const normalizeCreate = (payload = {}) => {
  const subject = {
    code: requireText(payload.code, "Subject code").toUpperCase(),
    name: requireText(payload.name, "Subject name"),
    short_name: typeof payload.shortName === "string" ? payload.shortName.trim() : "",
    subject_type: payload.subjectType,
    credits: normalizeNumber(payload.credits, "Credits", 0, 20),
    internal_max: normalizeNumber(payload.internalMax, "Internal max", 0, 100),
    external_max: normalizeNumber(payload.externalMax, "External max", 0, 100),
    total_max: normalizeNumber(payload.totalMax, "Total max", 0, 200),
    has_internal: payload.hasInternal !== undefined
      ? normalizeBoolean(payload.hasInternal, "Has internal")
      : payload.internalMax > 0,
    has_external: payload.hasExternal !== undefined
      ? normalizeBoolean(payload.hasExternal, "Has external")
      : payload.externalMax > 0
  };
  validateSubjectRules({
    subjectType: subject.subject_type, credits: subject.credits,
    internalMax: subject.internal_max, externalMax: subject.external_max,
    totalMax: subject.total_max, hasInternal: subject.has_internal, hasExternal: subject.has_external
  });
  return subject;
};

/** Isolated Supabase subject adapter; does not replace Mongo-backed production routes. */
export const createSupabaseSubjectRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");
  const findOne = async (query, operation, columns = selectColumns) => {
    const rows = expectRows(await request("subjects", { query: new URLSearchParams({ select: columns, ...Object.fromEntries(new URLSearchParams(query)) , limit: "2" }).toString() }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned more than one subject`);
    return rows.length ? mapSubject(rows[0]) : null;
  };
  return Object.freeze({
    listSubjects: async () => {
      const query = new URLSearchParams({ select: selectColumns, order: "created_at.desc" }).toString();
      return expectRows(await request("subjects", { query }), "subject list").map(mapSubject);
    },
    findSubjectById: async (id) => {
      assertUuid(id);
      return findOne(new URLSearchParams({ id: `eq.${id}` }).toString(), "subject ID lookup");
    },
    findSubjectByCode: async (code) => {
      const normalizedCode = requireText(code, "Subject code").toUpperCase();
      return findOne(new URLSearchParams({ code: `eq.${normalizedCode}` }).toString(), "subject code lookup");
    },
    createSubject: async (payload = {}) => {
      const body = { ...normalizeCreate(payload), is_active: true };
      const rows = expectRows(await request("subjects", {
        method: "POST", query: `select=${selectColumns}`, body, prefer: "return=representation"
      }), "subject create");
      if (rows.length !== 1) throw new Error("Supabase subject create did not return exactly one subject");
      return mapSubject(rows[0]);
    },
    updateSubject: async (id, payload = {}) => {
      assertUuid(id);
      const current = await findOne(new URLSearchParams({ id: `eq.${id}` }).toString(), "subject update lookup");
      if (!current) return null;
      const merged = {
        code: payload.code !== undefined ? payload.code : current.code,
        name: payload.name !== undefined ? payload.name : current.name,
        shortName: payload.shortName !== undefined ? payload.shortName : current.shortName,
        subjectType: payload.subjectType !== undefined ? payload.subjectType : current.subjectType,
        credits: payload.credits !== undefined ? payload.credits : current.credits,
        internalMax: payload.internalMax !== undefined ? payload.internalMax : current.internalMax,
        externalMax: payload.externalMax !== undefined ? payload.externalMax : current.externalMax,
        totalMax: payload.totalMax !== undefined ? payload.totalMax : current.totalMax,
        hasInternal: payload.hasInternal !== undefined ? payload.hasInternal : current.hasInternal,
        hasExternal: payload.hasExternal !== undefined ? payload.hasExternal : current.hasExternal
      };
      const normalized = normalizeCreate(merged);
      if (payload.isActive !== undefined) normalized.is_active = normalizeBoolean(payload.isActive, "Active status");
      const rows = expectRows(await request("subjects", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body: normalized, prefer: "return=representation"
      }), "subject update");
      if (rows.length > 1) throw new Error("Supabase subject update matched multiple rows");
      return rows.length ? mapSubject(rows[0]) : null;
    },
    toggleSubjectStatus: async (id) => {
      assertUuid(id);
      const current = await findOne(new URLSearchParams({ id: `eq.${id}` }).toString(), "subject status lookup");
      if (!current) return null;
      const rows = expectRows(await request("subjects", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body: { is_active: !current.isActive }, prefer: "return=representation"
      }), "subject status update");
      if (rows.length > 1) throw new Error("Supabase subject status update matched multiple rows");
      return rows.length ? mapSubject(rows[0]) : null;
    }
  });
};
