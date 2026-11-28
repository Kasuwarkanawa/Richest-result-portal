const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE_FIELDS = ["batchId", "programId", "regulationId", "semesterId", "subjectId"];
const DB_FIELDS = {
  batchId: "batch_id", programId: "program_id", regulationId: "regulation_id",
  semesterId: "semester_id", subjectId: "subject_id"
};
const SELECT = [
  "id,batch_id,program_id,regulation_id,semester_id,subject_id,sequence_no,is_elective,is_active,created_at,updated_at",
  "batch:batches(id,label,start_year,end_year,is_active)",
  "program:programs(id,code,name,short_name,degree_type,status)",
  "regulation:regulations(id,code,name,effective_from_batch_year,effective_to_batch_year,is_active)",
  "semester:semesters(id,number,label,display_order,is_active)",
  "subject:subjects(id,code,name,short_name,subject_type,credits,is_active)"
].join(",");
const requireUuid = (value, field) => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);
  }
  return value;
};
const requireBoolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean`);
  return value;
};
const requireSequence = (value) => {
  if (!Number.isInteger(value) || value < 0) throw new TypeError("Sequence number must be a non-negative integer");
  return value;
};
const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};
const mapMapping = (row) => ({
  _id: row.id, id: row.id,
  batchId: row.batch_id, programId: row.program_id, regulationId: row.regulation_id,
  semesterId: row.semester_id, subjectId: row.subject_id,
  sequenceNo: row.sequence_no, isElective: row.is_elective, isActive: row.is_active,
  batch: row.batch ?? null, program: row.program ?? null, regulation: row.regulation ?? null,
  semester: row.semester ?? null, subject: row.subject ?? null,
  createdAt: row.created_at ?? null, updatedAt: row.updated_at ?? null
});
const normalizeCreate = (payload = {}) => {
  const body = {};
  for (const field of REFERENCE_FIELDS) body[DB_FIELDS[field]] = requireUuid(payload[field], field);
  body.sequence_no = payload.sequenceNo === undefined ? 0 : requireSequence(payload.sequenceNo);
  body.is_elective = payload.isElective === undefined ? false : requireBoolean(payload.isElective, "Elective status");
  body.is_active = payload.isActive === undefined ? true : requireBoolean(payload.isActive, "Active status");
  return body;
};

/** Isolated Postgres adapter. All IDs are UUIDs; this repository is not runtime-wired. */
export const createSupabaseCurriculumMappingRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");
  const findOne = async (id, operation) => {
    const query = new URLSearchParams({ select: SELECT, id: `eq.${id}`, limit: "2" }).toString();
    const rows = expectRows(await request("curriculum_mappings", { query }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned multiple curriculum mappings`);
    return rows.length ? mapMapping(rows[0]) : null;
  };
  return Object.freeze({
    listCurriculumMappings: async () => {
      const query = new URLSearchParams({ select: SELECT, order: "created_at.desc" }).toString();
      return expectRows(await request("curriculum_mappings", { query }), "curriculum mapping list").map(mapMapping);
    },
    findCurriculumMappingById: async (id) => {
      requireUuid(id, "mapping ID");
      return findOne(id, "curriculum mapping lookup");
    },
    createCurriculumMapping: async (payload = {}) => {
      const body = normalizeCreate(payload);
      const rows = expectRows(await request("curriculum_mappings", {
        method: "POST", query: `select=${SELECT}`, body, prefer: "return=representation"
      }), "curriculum mapping create");
      if (rows.length !== 1) throw new Error("Supabase curriculum mapping create did not return exactly one row");
      return mapMapping(rows[0]);
    },
    updateCurriculumMapping: async (id, payload = {}) => {
      requireUuid(id, "mapping ID");
      const current = await findOne(id, "curriculum mapping update lookup");
      if (!current) return null;
      const merged = {
        batchId: payload.batchId ?? current.batchId,
        programId: payload.programId ?? current.programId,
        regulationId: payload.regulationId ?? current.regulationId,
        semesterId: payload.semesterId ?? current.semesterId,
        subjectId: payload.subjectId ?? current.subjectId,
        sequenceNo: payload.sequenceNo ?? current.sequenceNo,
        isElective: payload.isElective ?? current.isElective,
        isActive: payload.isActive ?? current.isActive
      };
      const body = normalizeCreate(merged);
      const rows = expectRows(await request("curriculum_mappings", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: SELECT }).toString(),
        body, prefer: "return=representation"
      }), "curriculum mapping update");
      if (rows.length > 1) throw new Error("Supabase curriculum mapping update matched multiple rows");
      return rows.length ? mapMapping(rows[0]) : null;
    },
    toggleCurriculumMappingStatus: async (id) => {
      requireUuid(id, "mapping ID");
      const current = await findOne(id, "curriculum mapping status lookup");
      if (!current) return null;
      const rows = expectRows(await request("curriculum_mappings", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${id}`, select: SELECT }).toString(),
        body: { is_active: !current.isActive }, prefer: "return=representation"
      }), "curriculum mapping status update");
      if (rows.length > 1) throw new Error("Supabase curriculum mapping status update matched multiple rows");
      return rows.length ? mapMapping(rows[0]) : null;
    }
  });
};
