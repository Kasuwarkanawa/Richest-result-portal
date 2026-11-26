import { PASS_STATUSES } from "../../config/constants.js";

const getSubjectId = (result) => {
  const subject = result.subjectId ?? result.subject;
  return String(subject?._id || subject?.id || subject || "");
};

export const selectLatestAttemptPerSubject = (results = []) => {
  const latestBySubject = new Map();
  const sorted = [...results].sort((a, b) => {
    const attemptDifference = Number(b.attemptNumber || 1) - Number(a.attemptNumber || 1);
    if (attemptDifference !== 0) return attemptDifference;

    const processedDifference =
      new Date(b.processedAt || b.updatedAt || b.createdAt || 0) -
      new Date(a.processedAt || a.updatedAt || a.createdAt || 0);
    if (processedDifference !== 0) return processedDifference;

    return Number(b.resultVersion || 0) - Number(a.resultVersion || 0);
  });

  for (const result of sorted) {
    const subjectId = getSubjectId(result);
    if (subjectId && !latestBySubject.has(subjectId)) {
      latestBySubject.set(subjectId, result);
    }
  }
  return Array.from(latestBySubject.values());
};

export const buildArrearSummary = (allPublishedProcessedResults = []) => {
  const latestResults = selectLatestAttemptPerSubject(allPublishedProcessedResults);
  const priorFailures = new Set(
    allPublishedProcessedResults
      .filter((item) => item.passStatus !== PASS_STATUSES.PASS)
      .map(getSubjectId)
  );

  const pending = latestResults.filter(
    (item) => item.passStatus !== PASS_STATUSES.PASS
  ).length;

  const cleared = latestResults.filter(
    (item) =>
      item.passStatus === PASS_STATUSES.PASS &&
      priorFailures.has(getSubjectId(item))
  ).length;

  return {
    totalPendingArrears: pending,
    totalClearedArrears: cleared,
  };
};
