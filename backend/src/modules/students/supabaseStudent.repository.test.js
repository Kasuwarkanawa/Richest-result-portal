import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseStudentRepository } from "./supabaseStudent.repository.js";

const STUDENT_ID = "c0b1c2d3-e4f5-4678-9012-abcdef123456";
const DEPARTMENT_ID = "a0b1c2d3-e4f5-4678-9012-abcdef123456";
const PROGRAM_ID = "b0b1c2d3-e4f5-4678-9012-abcdef123456";
const REGULATION_ID = "d0b1c2d3-e4f5-4678-9012-abcdef123456";
const BATCH_ID = "e0b1c2d3-e4f5-4678-9012-abcdef123456";
const SEMESTER_ID = "f0b1c2d3-e4f5-4678-9012-abcdef123456";
const row = (overrides = {}) => ({
  id: STUDENT_ID, register_number: "RIGCHEW001", university_register_no: "UNI001",
  full_name: "Student Example", dob: "2004-02-03", student_pin_hash: "$2b$12$hash",
  student_pin_generated_at: "2026-01-01T00:00:00.000Z", gender: "FEMALE",
  mobile_no: "08000000000", email: "student@example.com", department_id: DEPARTMENT_ID,
  program_id: PROGRAM_ID, regulation_id: REGULATION_ID, batch_id: BATCH_ID,
  current_semester_id: SEMESTER_ID, academic_status: "ACTIVE", admission_year: 2023,
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides
});
const payload = () => ({
  registerNumber: " rigchew001 ", universityRegisterNo: " UNI001 ",
  fullName: " Student Example ", dob: "2004-02-03", gender: "female",
  mobileNo: " 08000000000 ", email: " STUDENT@EXAMPLE.COM ",
  departmentId: DEPARTMENT_ID, programId: PROGRAM_ID, regulationId: REGULATION_ID,
  batchId: BATCH_ID, currentSemesterId: SEMESTER_ID, admissionYear: 2023,
  studentPinHash: "$2b$12$hash", studentPinGeneratedAt: "2026-01-01T00:00:00.000Z"
});

test("requires an injected server-side request function", () => {
  assert.throws(() => createSupabaseStudentRepository(), /server-side/);
});
test("lists students and maps database fields without dropping the PIN hash", async () => {
  let call;
  const repository = createSupabaseStudentRepository({ request: async (table, options) => { call = { table, options }; return [row()]; } });
  const students = await repository.listStudents();
  assert.equal(call.table, "students");
  assert.match(call.options.query, /order=full_name.asc/);
  assert.equal(students[0]._id, STUDENT_ID);
  assert.equal(students[0].registerNumber, "RIGCHEW001");
  assert.equal(students[0].departmentId, DEPARTMENT_ID);
  assert.equal(students[0].studentPinHash, "$2b$12$hash");
});
test("finds a student by PostgreSQL UUID or normalized registration number", async () => {
  const calls = [];
  const repository = createSupabaseStudentRepository({ request: async (_table, options) => { calls.push(options); return [row()]; } });
  assert.equal((await repository.findStudentById(STUDENT_ID)).id, STUDENT_ID);
  assert.equal((await repository.findStudentByRegisterNumber(" rigchew001 ")).registerNumber, "RIGCHEW001");
  assert.match(calls[0].query, /id=eq/);
  assert.match(calls[1].query, /register_number=eq.RIGCHEW001/);
  await assert.rejects(repository.findStudentById("507f1f77bcf86cd799439011"), /UUID/);
});
test("creates normalized student data, retaining the bcrypt PIN hash and explicit mapped ID", async () => {
  let call;
  const repository = createSupabaseStudentRepository({ request: async (_table, options) => { call = options; return [row()]; } });
  const created = await repository.createStudent({ ...payload(), id: STUDENT_ID });
  assert.equal(created.registerNumber, "RIGCHEW001");
  assert.equal(created.email, "student@example.com");
  assert.equal(created.studentPinHash, "$2b$12$hash");
  assert.equal(call.body.id, STUDENT_ID);
  assert.equal(call.body.student_pin_hash, "$2b$12$hash");
  assert.equal(call.body.academic_status, "ACTIVE");
  assert.equal(call.method, "POST");
});
test("allows database-generated UUIDs for new students and rejects invalid linked IDs", async () => {
  let call;
  const repository = createSupabaseStudentRepository({ request: async (_table, options) => { call = options; return [row()]; } });
  await repository.createStudent(payload());
  assert.equal(Object.hasOwn(call.body, "id"), false);
  await assert.rejects(repository.createStudent({ ...payload(), departmentId: "507f1f77bcf86cd799439011" }), /UUID/);
});
test("rejects invalid required fields, dates, academic statuses and admission years", async () => {
  const repository = createSupabaseStudentRepository({ request: async () => [row()] });
  await assert.rejects(repository.createStudent({ ...payload(), fullName: " " }), /Full name/);
  await assert.rejects(repository.createStudent({ ...payload(), dob: "not-a-date" }), /valid date/);
  await assert.rejects(repository.createStudent({ ...payload(), academicStatus: "SUSPENDED" }), /Academic status/);
  await assert.rejects(repository.createStudent({ ...payload(), admissionYear: 1800 }), /Admission year/);
});
test("updates only supplied fields and does not overwrite PIN credentials", async () => {
  let call;
  const repository = createSupabaseStudentRepository({ request: async (_table, options) => { call = options; return [row({ full_name: "Updated Name" })]; } });
  const updated = await repository.updateStudent(STUDENT_ID, { fullName: " Updated Name " });
  assert.equal(updated.fullName, "Updated Name");
  assert.deepEqual(call.body, { full_name: "Updated Name" });
  assert.equal(call.method, "PATCH");
  assert.match(call.query, /id=eq/);
});
test("updates PIN hash only when explicitly supplied and rejects empty updates", async () => {
  let call;
  const repository = createSupabaseStudentRepository({ request: async (_table, options) => { call = options; return [row()]; } });
  await repository.updateStudent(STUDENT_ID, { studentPinHash: "$2b$12$new-hash", studentPinGeneratedAt: "2026-02-01T00:00:00Z" });
  assert.equal(call.body.student_pin_hash, "$2b$12$new-hash");
  assert.equal(call.body.student_pin_generated_at, "2026-02-01T00:00:00.000Z");
  await assert.rejects(repository.updateStudent(STUDENT_ID, {}), /At least one/);
});
test("toggles active students to discontinued and leaves other statuses resumable", async () => {
  const calls = [];
  const repository = createSupabaseStudentRepository({ request: async (_table, options) => {
    calls.push(options);
    return options.method === "PATCH" ? [row({ academic_status: "DISCONTINUED" })] : [row()];
  } });
  const updated = await repository.toggleStudentAcademicStatus(STUDENT_ID);
  assert.equal(updated.academicStatus, "DISCONTINUED");
  assert.equal(calls[1].body.academic_status, "DISCONTINUED");
});
test("returns null for missing records and rejects invalid response shapes", async () => {
  const empty = createSupabaseStudentRepository({ request: async () => [] });
  assert.equal(await empty.findStudentById(STUDENT_ID), null);
  assert.equal(await empty.updateStudent(STUDENT_ID, { fullName: "No match" }), null);
  const invalid = createSupabaseStudentRepository({ request: async () => ({}) });
  await assert.rejects(invalid.listStudents(), /invalid response/);
});
