const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACADEMIC_STATUSES = new Set(["ACTIVE", "GRADUATED", "DISCONTINUED"]);
const SELECT = "id,register_number,university_register_no,full_name,dob,student_pin_hash,student_pin_generated_at,gender,mobile_no,email,department_id,program_id,regulation_id,batch_id,current_semester_id,academic_status,admission_year,created_at,updated_at";

const requireText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
};
const requireUuid = (value, field) => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError(`A valid PostgreSQL UUID is required for ${field}`);
  return value.toLowerCase();
};
const normalizeDate = (value, field) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError(`${field} must be a valid date`);
  return date.toISOString().slice(0, 10);
};
const normalizeAdmissionYear = (value) => {
  if (!Number.isInteger(value) || value < 1900 || value > 3000) throw new TypeError("Admission year must be an integer between 1900 and 3000");
  return value;
};
const normalizeAcademicStatus = (value) => {
  const status = requireText(value, "Academic status").toUpperCase();
  if (!ACADEMIC_STATUSES.has(status)) throw new TypeError("Academic status must be ACTIVE, GRADUATED or DISCONTINUED");
  return status;
};
const optionalText = (value, field, { upper = false, lower = false } = {}) => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new TypeError(`${field} must be text`);
  const normalized = value.trim();
  return upper ? normalized.toUpperCase() : lower ? normalized.toLowerCase() : normalized;
};
const expectRows = (rows, operation) => {
  if (!Array.isArray(rows)) throw new TypeError(`Supabase ${operation} returned an invalid response`);
  return rows;
};
const mapStudent = (row) => ({
  _id: row.id, id: row.id, registerNumber: row.register_number,
  universityRegisterNo: row.university_register_no, fullName: row.full_name,
  dob: row.dob, studentPinHash: row.student_pin_hash ?? null,
  studentPinGeneratedAt: row.student_pin_generated_at ?? null,
  gender: row.gender, mobileNo: row.mobile_no, email: row.email,
  departmentId: row.department_id, programId: row.program_id,
  regulationId: row.regulation_id, batchId: row.batch_id,
  currentSemesterId: row.current_semester_id, academicStatus: row.academic_status,
  admissionYear: row.admission_year, createdAt: row.created_at ?? null,
  updatedAt: row.updated_at ?? null
});
const normalizePayload = (payload, { partial = false } = {}) => {
  const body = {};
  const set = (key, value, transform) => {
    if (!partial || value !== undefined) body[key] = transform(value);
  };
  set("register_number", payload.registerNumber, (v) => requireText(v, "Register number").toUpperCase());
  set("university_register_no", payload.universityRegisterNo, (v) => optionalText(v, "University register number"));
  set("full_name", payload.fullName, (v) => requireText(v, "Full name"));
  set("dob", payload.dob, (v) => normalizeDate(v, "Date of birth"));
  set("gender", payload.gender, (v) => optionalText(v, "Gender", { upper: true }));
  set("mobile_no", payload.mobileNo, (v) => optionalText(v, "Mobile number"));
  set("email", payload.email, (v) => optionalText(v, "Email", { lower: true }));
  set("department_id", payload.departmentId, (v) => requireUuid(v, "department ID"));
  set("program_id", payload.programId, (v) => requireUuid(v, "program ID"));
  set("regulation_id", payload.regulationId, (v) => requireUuid(v, "regulation ID"));
  set("batch_id", payload.batchId, (v) => requireUuid(v, "batch ID"));
  set("current_semester_id", payload.currentSemesterId, (v) => requireUuid(v, "semester ID"));
  set("academic_status", payload.academicStatus ?? (partial ? undefined : "ACTIVE"), normalizeAcademicStatus);
  set("admission_year", payload.admissionYear, normalizeAdmissionYear);
  if (payload.studentPinHash !== undefined) {
    if (payload.studentPinHash !== null && (typeof payload.studentPinHash !== "string" || !payload.studentPinHash.trim())) {
      throw new TypeError("Student PIN hash must be a non-empty string or null");
    }
    body.student_pin_hash = payload.studentPinHash;
  }
  if (payload.studentPinGeneratedAt !== undefined) {
    if (payload.studentPinGeneratedAt === null) body.student_pin_generated_at = null;
    else {
      const generatedAt = new Date(payload.studentPinGeneratedAt);
      if (Number.isNaN(generatedAt.getTime())) throw new TypeError("Student PIN generated date must be valid");
      body.student_pin_generated_at = generatedAt.toISOString();
    }
  }
  return body;
};

/** Server-only Supabase student adapter. Legacy Mongo ObjectIds must be resolved through the verified ID ledger before calling it. */
export const createSupabaseStudentRepository = ({ request } = {}) => {
  if (typeof request !== "function") throw new TypeError("A server-side Supabase request function is required");
  const findOne = async (query, operation) => {
    const fullQuery = new URLSearchParams({ select: SELECT, ...Object.fromEntries(new URLSearchParams(query)), limit: "2" }).toString();
    const rows = expectRows(await request("students", { query: fullQuery }), operation);
    if (rows.length > 1) throw new Error(`Supabase ${operation} returned more than one student`);
    return rows.length ? mapStudent(rows[0]) : null;
  };
  return Object.freeze({
    listStudents: async () => {
      const query = new URLSearchParams({ select: SELECT, order: "full_name.asc" }).toString();
      return expectRows(await request("students", { query }), "student list").map(mapStudent);
    },
    findStudentById: async (id) => findOne(new URLSearchParams({ id: `eq.${requireUuid(id, "student ID")}` }).toString(), "student ID lookup"),
    findStudentByRegisterNumber: async (registerNumber) => findOne(
      new URLSearchParams({ register_number: `eq.${requireText(registerNumber, "Register number").toUpperCase()}` }).toString(),
      "student register number lookup"
    ),
    createStudent: async (payload = {}) => {
      const body = normalizePayload(payload);
      if (payload.id !== undefined) body.id = requireUuid(payload.id, "student ID");
      const rows = expectRows(await request("students", {
        method: "POST", query: `select=${SELECT}`, body, prefer: "return=representation"
      }), "student create");
      if (rows.length !== 1) throw new Error("Supabase student create did not return exactly one student");
      return mapStudent(rows[0]);
    },
    updateStudent: async (id, payload = {}) => {
      const studentId = requireUuid(id, "student ID");
      const body = normalizePayload(payload, { partial: true });
      if (payload.studentPinHash !== undefined || payload.studentPinGeneratedAt !== undefined) {
        // PIN fields may be migrated or rotated, but never silently cleared by profile updates.
      }
      if (!Object.keys(body).length) throw new TypeError("At least one student field must be supplied");
      const rows = expectRows(await request("students", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${studentId}`, select: SELECT }).toString(),
        body, prefer: "return=representation"
      }), "student update");
      if (rows.length > 1) throw new Error("Supabase student update matched multiple rows");
      return rows.length ? mapStudent(rows[0]) : null;
    },
    toggleStudentAcademicStatus: async (id) => {
      const studentId = requireUuid(id, "student ID");
      const current = await findOne(new URLSearchParams({ id: `eq.${studentId}` }).toString(), "student status lookup");
      if (!current) return null;
      const nextStatus = current.academicStatus === "ACTIVE" ? "DISCONTINUED" : "ACTIVE";
      const rows = expectRows(await request("students", {
        method: "PATCH",
        query: new URLSearchParams({ id: `eq.${studentId}`, select: SELECT }).toString(),
        body: { academic_status: nextStatus }, prefer: "return=representation"
      }), "student status update");
      if (rows.length > 1) throw new Error("Supabase student status update matched multiple rows");
      return rows.length ? mapStudent(rows[0]) : null;
    }
  });
};
