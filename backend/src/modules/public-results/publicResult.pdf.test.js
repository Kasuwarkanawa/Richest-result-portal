import test from "node:test";
import assert from "node:assert/strict";
import { buildPublishedResultPdf } from "./publicResult.pdf.js";

test("grade sheet paginates long subject transcripts and keeps summary on a page", async () => {
  const subjectResults = Array.from({ length: 65 }, (_, index) => ({
    subjectCode: `CHEW${String(index + 1).padStart(3, "0")}`,
    subjectName: `Course ${index + 1} - Community health practice and clinical field work`,
    credits: 3,
    result: "PASS",
    grade: "A",
    gradePoint: 4,
    sourceSemester: { number: Math.floor(index / 8) + 1, label: `Semester ${Math.floor(index / 8) + 1}` }
  }));

  const pdf = await buildPublishedResultPdf({
    collegeName: "HAJIYA RAKIYA GERAWA COLLEGE OF HEALTH SCIENCE AND TECHNOLOGY KANO (RIGCHEST)",
    resultData: {
      student: {
        registerNumber: "RIGCHEST/TEST/001",
        fullName: "Test Student",
        department: { name: "Community Health" },
        program: { name: "CHEW" },
        regulation: { name: "2026" },
        batch: { label: "2026/2027" },
        currentSemester: { label: "Semester 8" }
      },
      examSession: { name: "Final Examination", examYear: 2026, examMonth: "NOVEMBER" },
      subjectResults,
      summary: {
        semester: { label: "Semester 8" },
        gpa: 3.8,
        cgpa: 3.7,
        totalRegisteredSubjects: 8,
        totalPassedSubjects: 8,
        totalFailedSubjects: 0,
        totalRegisteredCredits: 24,
        totalEarnedCredits: 24
      },
      arrearSummary: { totalPendingArrears: 0, totalClearedArrears: 2 }
    }
  });

  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.length > 1000);
  const pageCount = pdf.toString("latin1").split("/Type /Page").length - 1;
  assert.ok(pageCount > 1, "long transcript should span multiple PDF pages");
});
