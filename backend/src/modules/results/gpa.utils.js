export const roundToTwo = (value) => {
  return Number(Number(value || 0).toFixed(2));
};

const calculateWeightedPointAverage = (results) => {
  const rows = results.map((item) => ({
    point: Number(item.gradePoint || 0),
    credits: Number(item.subjectId?.credits ?? item.creditsAttempted ?? 0)
  })).filter((item) => Number.isFinite(item.credits) && item.credits > 0);

  const totalCredits = rows.reduce((sum, item) => sum + item.credits, 0);
  if (totalCredits === 0) return 0;

  const totalWeightedPoints = rows.reduce(
    (sum, item) => sum + item.point * item.credits,
    0
  );

  return roundToTwo(totalWeightedPoints / totalCredits);
};

export const calculateGPA = (processedResults) => {
  return calculateWeightedPointAverage(processedResults);
};

export const calculateCGPA = (allProcessedResultsForStudent) => {
  return calculateWeightedPointAverage(allProcessedResultsForStudent);
};
