import { Student } from "../students/student.model.js";
import { PublishSnapshot } from "../publish/publishSnapshot.model.js";
import { PublishedResultSnapshotRecord } from "../publish/publishedResultSnapshotRecord.model.js";
import { ApiError } from "../../utils/apiError.js";
import { selectLatestAttemptPerSubject, buildArrearSummary } from "./publicResult.utils.js";

const normalizeDateOnly = (dateValue) => {
  const d = new Date(dateValue);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
};

const sameDateOnly = (a, b) => {
  const d1 = normalizeDateOnly(a);
  const d2 = normalizeDateOnly(b);
  return d1.getTime() === d2.getTime();
};

const buildStudentProfile = (student) => ({
  registerNumber: student.registerNumber,
  fullName: student.fullName,
  department: student.departmentId
    ? {
        code: student.departmentId.code,
        name: student.departmentId.name,
        shortName: student.departmentId.shortName,
      }
    : null,
  program: student.programId
    ? {
        code: student.programId.code,
        name: student.programId.name,
        degreeType: student.programId.degreeType,
      }
    : null,
  regulation: student.regulationId
    ? {
        code: student.regulationId.code,
        name: student.regulationId.name,
      }
    : null,
  batch: student.batchId
    ? {
        label: student.batchId.label,
        startYear: student.batchId.startYear,
        endYear: student.batchId.endYear,
      }
    : null,
  currentSemester: student.currentSemesterId
    ? {
        number: student.currentSemesterId.number,
        label: student.currentSemesterId.label,
      }
    : null,
});

const loadStudentSnapshotData = async (snapshots, studentId) => {
  const bySnapshot = new Map();
  const modernSnapshots = snapshots.filter((snapshot) => Number(snapshot.storageVersion || 1) >= 2);
  const modernIds = modernSnapshots.map((snapshot) => snapshot._id);

  for (const snapshot of snapshots) {
    bySnapshot.set(String(snapshot._id), { results: [], summaries: [] });
    if (Number(snapshot.storageVersion || 1) < 2) {
      const legacy = bySnapshot.get(String(snapshot._id));
      legacy.results = (snapshot.frozenResults || []).filter((item) =>
        String(item.student?.id || item.studentId) === String(studentId)
      );
      legacy.summaries = (snapshot.frozenSummaries || []).filter((item) =>
        String(item.studentId) === String(studentId)
      );
    }
  }

  if (modernIds.length) {
    const records = await PublishedResultSnapshotRecord.find({
      snapshotId: { $in: modernIds },
      studentId,
      recordType: { $in: ["RESULT", "SUMMARY"] }
    }).lean();

    for (const record of records) {
      const bucket = bySnapshot.get(String(record.snapshotId));
      if (!bucket) continue;
      if (record.recordType === "RESULT") bucket.results.push(record.payload);
      if (record.recordType === "SUMMARY") bucket.summaries.push(record.payload);
    }
  }

  return bySnapshot;
};

const getValidatedStudent = async ({ registerNumber, dob }) => {
  const student = await Student.findOne({
    registerNumber: registerNumber.trim().toUpperCase(),
  })
    .populate("departmentId", "code name shortName")
    .populate("programId", "code name degreeType")
    .populate("regulationId", "code name")
    .populate("batchId", "label startYear endYear")
    .populate("currentSemesterId", "number label");

  if (!student) {
    // Use the same response for unknown register numbers and DOB mismatches
    // to avoid exposing whether a student record exists.
    throw new ApiError(401, "Invalid register number or date of birth");
  }

  if (!sameDateOnly(student.dob, dob)) {
    throw new ApiError(401, "Invalid register number or date of birth");
  }

  return student;
};

export const searchPublishedResultService = async ({ registerNumber, dob }) => {
  const student = await getValidatedStudent({ registerNumber, dob });
  const snapshots = await PublishSnapshot.find({ status: "ACTIVE" })
    .populate("examSessionId", "name examMonth examYear sessionCategory status")
    .sort({ publishedAt: -1 });
  const snapshotData = await loadStudentSnapshotData(snapshots, student._id);
  const targetSnapshot = snapshots.find((snapshot) =>
    snapshotData.get(String(snapshot._id))?.results.length
  );
  if (!targetSnapshot) throw new ApiError(404, "No published result found for this student");

  // Build the student's transcript from the newest active publication of each
  // exam session. A later arrear session may contain only a few subjects, so
  // limiting the transcript to that one snapshot would hide earlier courses.
  const allPublishedResults = snapshots.flatMap((snapshot) =>
    snapshotData.get(String(snapshot._id))?.results || []
  );
  const subjectResults = selectLatestAttemptPerSubject(allPublishedResults).sort((a, b) =>
    Number(a.sourceSemester?.number || 0) - Number(b.sourceSemester?.number || 0) ||
    String(a.subject?.code || "").localeCompare(String(b.subject?.code || ""))
  );

  const targetSummaries = snapshotData.get(String(targetSnapshot._id)).summaries;
  const frozenSummary = [...targetSummaries].sort((a, b) =>
    Number(b.semester?.displayOrder || b.semester?.number || 0) -
    Number(a.semester?.displayOrder || a.semester?.number || 0)
  )[0] || null;

  return {
    student: buildStudentProfile(student),
    examSession: targetSnapshot.examSessionId ? {
      _id: targetSnapshot.examSessionId._id,
      name: targetSnapshot.examSessionId.name,
      examMonth: targetSnapshot.examSessionId.examMonth,
      examYear: targetSnapshot.examSessionId.examYear,
      sessionCategory: targetSnapshot.examSessionId.sessionCategory
    } : null,
    subjectResults: subjectResults.map((item) => ({
      subjectCode: item.subject?.code || "",
      subjectName: item.subject?.name || "",
      shortName: item.subject?.shortName || "",
      subjectType: item.subject?.subjectType || "",
      credits: item.subject?.credits || 0,
      sourceSemester: item.sourceSemester ? {
        number: item.sourceSemester.number,
        label: item.sourceSemester.label
      } : null,
      attemptType: item.attemptType,
      attemptNumber: item.attemptNumber,
      result: item.passStatus,
      grade: item.grade,
      gradePoint: item.gradePoint,
      creditsEarned: item.creditsEarned
    })),
    summary: frozenSummary ? {
      semester: frozenSummary.semester ? {
        number: frozenSummary.semester.number,
        label: frozenSummary.semester.label
      } : null,
      gpa: frozenSummary.gpa,
      cgpa: frozenSummary.cgpa,
      totalRegisteredSubjects: frozenSummary.totalRegisteredSubjects,
      totalPassedSubjects: frozenSummary.totalPassedSubjects,
      totalFailedSubjects: frozenSummary.totalFailedSubjects,
      totalRegisteredCredits: frozenSummary.totalRegisteredCredits,
      totalEarnedCredits: frozenSummary.totalEarnedCredits,
      currentArrearCount: frozenSummary.currentArrearCount,
      totalPendingArrearCount: frozenSummary.totalPendingArrearCount,
      totalClearedArrearCount: frozenSummary.totalClearedArrearCount
    } : null,
    arrearSummary: buildArrearSummary(allPublishedResults)
  };
};

export const getPublishedResultHistoryService = async ({ registerNumber, dob }) => {
  const student = await getValidatedStudent({ registerNumber, dob });
  const snapshots = await PublishSnapshot.find({ status: "ACTIVE" })
    .populate("examSessionId", "name examMonth examYear sessionCategory status")
    .sort({ publishedAt: -1 });
  const snapshotData = await loadStudentSnapshotData(snapshots, student._id);

  const studentSnapshots = snapshots.filter((snapshot) =>
    snapshotData.get(String(snapshot._id))?.summaries.length
  );
  const history = studentSnapshots.flatMap((snapshot) =>
    (snapshotData.get(String(snapshot._id))?.summaries || []).map((item) => ({
      examSession: snapshot.examSessionId ? {
        _id: snapshot.examSessionId._id,
        name: snapshot.examSessionId.name,
        examMonth: snapshot.examSessionId.examMonth,
        examYear: snapshot.examSessionId.examYear,
        sessionCategory: snapshot.examSessionId.sessionCategory
      } : null,
      snapshotVersion: snapshot.snapshotVersion,
      publishedAt: snapshot.publishedAt,
      summary: {
        semester: item.semester ? {
          number: item.semester.number,
          label: item.semester.label
        } : null,
        gpa: item.gpa,
        cgpa: item.cgpa,
        totalRegisteredSubjects: item.totalRegisteredSubjects,
        totalPassedSubjects: item.totalPassedSubjects,
        totalFailedSubjects: item.totalFailedSubjects,
        totalRegisteredCredits: item.totalRegisteredCredits,
        totalEarnedCredits: item.totalEarnedCredits,
        currentArrearCount: item.currentArrearCount,
        totalPendingArrearCount: item.totalPendingArrearCount,
        totalClearedArrearCount: item.totalClearedArrearCount
      }
    }))
  );

  if (history.length === 0) {
    throw new ApiError(404, "No published result history found for this student");
  }

  const allPublishedResults = snapshots.flatMap((snapshot) =>
    snapshotData.get(String(snapshot._id))?.results || []
  ).map((item) => ({ ...item, subjectId: item.subject }));

  return {
    student: buildStudentProfile(student),
    history,
    arrearSummary: buildArrearSummary(allPublishedResults)
  };
};

export const getPublishedResultForPdfService = async ({
  registerNumber,
  dob,
}) => {
  return searchPublishedResultService({ registerNumber, dob });
};
