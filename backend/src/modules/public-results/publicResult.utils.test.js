import test from "node:test";
import assert from "node:assert/strict";
import { PASS_STATUSES } from "../../config/constants.js";
import { selectLatestAttemptPerSubject, buildArrearSummary } from "./publicResult.utils.js";

test("latest attempt selection supports frozen subject objects with id fields", () => {
  const results = [
    { subjectId: { id: "sub-1" }, attemptNumber: 1, passStatus: PASS_STATUSES.FAIL },
    { subject: { id: "sub-1" }, attemptNumber: 2, passStatus: PASS_STATUSES.PASS },
    { subjectId: "sub-2", attemptNumber: 1, passStatus: PASS_STATUSES.FAIL }
  ];

  const latest = selectLatestAttemptPerSubject(results);
  assert.equal(latest.length, 2);
  assert.equal(latest.find((item) => (item.subject?.id || item.subjectId?.id || item.subjectId) === "sub-1").attemptNumber, 2);
});

test("arrear summary counts failed latest attempts and previously failed but cleared subjects", () => {
  const results = [
    { subject: { id: "sub-1" }, attemptNumber: 1, passStatus: PASS_STATUSES.FAIL },
    { subject: { id: "sub-1" }, attemptNumber: 2, passStatus: PASS_STATUSES.PASS },
    { subjectId: "sub-2", attemptNumber: 1, passStatus: PASS_STATUSES.FAIL },
    { subjectId: "sub-3", attemptNumber: 1, passStatus: PASS_STATUSES.PASS }
  ];

  assert.deepEqual(buildArrearSummary(results), {
    totalPendingArrears: 1,
    totalClearedArrears: 1
  });
});

test("arrear summary does not count an initial pass as a cleared arrear", () => {
  assert.deepEqual(buildArrearSummary([
    { subjectId: "sub-1", attemptNumber: 1, passStatus: PASS_STATUSES.PASS }
  ]), {
    totalPendingArrears: 0,
    totalClearedArrears: 0
  });
});
