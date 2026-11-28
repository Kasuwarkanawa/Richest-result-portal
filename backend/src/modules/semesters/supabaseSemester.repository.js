const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
};
const assertUuid = (id) => {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) throw new TypeError("A valid PostgreSQL UUID is required for semester ID");
};
const normalizePosition = (value, field) => {
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new TypeError(`${field} must be an integer between 1 and 20`);
  return value;
};
const normalizeBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
};
const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};
const mapSemester = (row) => ({
  _id: row.id, id: row.id, number: row.number, label: row.label,
  displayOrder: row.display_order, isActive: row.is_active,
  createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null
});
const selectColumns = "id,number,label,display_order,is_active,created_at,updated_at";

/** Isolated Supabase semester adapter; not wired into Mongo-backed routes. */
export const createSupabaseSemesterRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");
  const findOne = async (query, operation) => {
    const rows = expectRows(await request("semesters", { query }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned more than one semester`);
    return rows.length ? mapSemester(rows[0]) : null;
  };
  return Object.freeze({
    listSemesters: async () => {
      const query = new URLSearchParams({ select: selectColumns, order: "display_order.asc,created_at.desc" }).toString();
      return expectRows(await request("semesters", { query }), "semester list").map(mapSemester);
    },
    findSemesterById: async (id) => {
      assertUuid(id);
      return findOne(new URLSearchParams({ select: selectColumns, id: `eq.${id}`, limit: "2" }).toString(), "semester ID lookup");
    },
    findSemesterByNumber: async (number) => {
      normalizePosition(number, "Semester number");
      return findOne(new URLSearchParams({ select: selectColumns, number: `eq.${number}`, limit: "2" }).toString(), "semester number lookup");
    },
    createSemester: async (payload = {}) => {
      const body = {
        number: normalizePosition(payload.number, "Semester number"),
        label: requireText(payload.label, "Semester label"),
        display_order: normalizePosition(payload.displayOrder, "Display order"),
        is_active: true
      };
      const rows = expectRows(await request("semesters", {
        method: "POST", query: `select=${selectColumns}`, body, prefer: "return=representation"
      }), "semester create");
      if (rows.length !== 1) throw new Error("Supabase semester create did not return exactly one semester");
      return mapSemester(rows[0]);
    },
    updateSemester: async (id, payload = {}) => {
      assertUuid(id);
      const body = {};
      if (payload.number !== undefined) body.number = normalizePosition(payload.number, "Semester number");
      if (payload.label !== undefined) body.label = requireText(payload.label, "Semester label");
      if (payload.displayOrder !== undefined) body.display_order = normalizePosition(payload.displayOrder, "Display order");
      if (payload.isActive !== undefined) body.is_active = normalizeBoolean(payload.isActive, "Active status");
      if (!Object.keys(body).length) throw new TypeError("At least one semester field must be supplied");
      const rows = expectRows(await request("semesters", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body, prefer: "return=representation"
      }), "semester update");
      if (rows.length > 1) throw new Error("Supabase semester update matched multiple rows");
      return rows.length ? mapSemester(rows[0]) : null;
    },
    toggleSemesterStatus: async (id) => {
      assertUuid(id);
      const current = await findOne(new URLSearchParams({ select: "id,is_active", id: `eq.${id}`, limit: "2" }).toString(), "semester status lookup");
      if (!current) return null;
      const rows = expectRows(await request("semesters", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: selectColumns }).toString(),
        body: { is_active: !current.isActive }, prefer: "return=representation"
      }), "semester status update");
      if (rows.length > 1) throw new Error("Supabase semester status update matched multiple rows");
      return rows.length ? mapSemester(rows[0]) : null;
    }
  });
};
