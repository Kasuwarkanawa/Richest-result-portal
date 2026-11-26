import test from "node:test";
import assert from "node:assert/strict";
import { validateGradeRules } from "./gradingPolicy.service.js";

test("accepts adjacent non-overlapping grade ranges", () => {
  assert.doesNotThrow(() => validateGradeRules([
    { grade: "F", min: 0, max: 39, point: 0 },
    { grade: "C", min: 40, max: 59, point: 2 },
    { grade: "A", min: 60, max: 100, point: 4 }
  ]));
});

test("rejects overlapping inclusive grade ranges", () => {
  assert.throws(
    () => validateGradeRules([
      { grade: "B", min: 50, max: 79, point: 3 },
      { grade: "A", min: 79, max: 100, point: 4 }
    ]),
    /overlap/
  );
});

test("rejects duplicate grade labels", () => {
  assert.throws(
    () => validateGradeRules([
      { grade: "A", min: 80, max: 100, point: 4 },
      { grade: " a ", min: 0, max: 79, point: 2 }
    ]),
    /must be unique/
  );
});

test("rejects an inverted grade range", () => {
  assert.throws(
    () => validateGradeRules([
      { grade: "A", min: 80, max: 60, point: 4 }
    ]),
    /min cannot be greater than max/
  );
});
