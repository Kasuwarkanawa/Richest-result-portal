import test from "node:test";
import assert from "node:assert/strict";
import { calculateGPA, calculateCGPA } from "./gpa.utils.js";

const course = (credits, gradePoint) => ({
  subjectId: { credits },
  gradePoint
});

test("GPA includes failed course credits in the attempted-credit denominator", () => {
  const results = [
    course(3, 4),
    course(3, 0)
  ];
  assert.equal(calculateGPA(results), 2);
});

test("CGPA is weighted by the credits of the latest attempts supplied", () => {
  const latestAttempts = [
    course(2, 3.5),
    course(4, 2)
  ];
  assert.equal(calculateCGPA(latestAttempts), 2.5);
});

test("GPA returns zero when there are no credit-bearing courses", () => {
  assert.equal(calculateGPA([course(0, 4)]), 0);
});
